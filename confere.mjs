// Confere o núcleo do report (o <script id="nucleo"> do index.html) contra uma exportação real.
//
//   node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx>             imprime os números e confere as partições
//   node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx> --controle  estraga uma demanda e PRECISA reprovar
//   node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx> --controle-subfase  põe uma demanda na subfase errada e PRECISA reprovar
//   node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx> --controle-calculo  estraga uma conta de carga e PRECISA reprovar
//   ... --ponto=2026-09-28:95   medição anterior de prontas ou concluídas, para imprimir o ritmo e a previsão
//
// Roda o mesmo código que a página roda; nada de reimplementar a regra aqui. O que se confere
// são invariantes que valem para qualquer exportação: cada demanda cai em exatamente uma
// situação e em no máximo uma etapa do fluxo, e as somas de cada seção fecham com o total.
// A subfase de cada demanda é conferida contra a regra escrita sobre os campos crus (fase da
// lista, Data de Iníco, Data CAB): somas que fecham não provam que cada uma caiu no lugar certo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--'));
const modo = args.find((a) => a.startsWith('--controle'));
const pontos = args.filter((a) => a.startsWith('--ponto=')).map((a) => { const [corte, n] = a.slice(8).split(':'); return { corte, prontasOuConcluidas: +n, fonte: 'linha de comando' }; });
if (!arquivo) { console.error('uso: node confere.mjs <exportacao.xlsx> [--controle]'); process.exit(2); }

const html = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
const nucleo = /<script id="nucleo">([\s\S]*?)<\/script>/.exec(html)[1];
new Function(nucleo)();
const E = globalThis.Esteira;

const buf = readFileSync(arquivo);
const snap = E.normalizar(await E.lerXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), arquivo);
if (modo === '--controle') snap.demandas[0].fase = 'Fase que não existe';
const m = E.analisar(snap, null, pontos);
if (modo === '--controle-calculo') m.cargas.abap.find((o) => o.pico).pico.horas += 10;
if (modo === '--controle-subfase') {
  const d = m.ds.find((x) => x.etapa);
  d.etapa = d.etapa === 'preprojeto' ? 'preparacao' : 'preprojeto';
}

const falhas = [];
const confere = (ok, txt) => { if (!ok) falhas.push(txt); };
const soma = (o) => Object.values(o).reduce((s, n) => s + n, 0);

confere(soma(m.st) === m.ds.length, `situações somam ${soma(m.st)}, demandas ${m.ds.length}`);
confere(m.etapas.reduce((s, e) => s + e.n, 0) + m.concl.length + soma(m.fora) === m.ds.length, 'subfases + concluídas + fora do fluxo não fecham com o total');
confere(m.etapas.length === 8 && new Set(m.etapas.map((e) => e.grupo)).size === 4, 'o fluxo macro precisa ter 4 fases e 8 subfases');
confere(m.pis.reduce((s, p) => s + p.n, 0) === m.ds.length, 'PIs não fecham com o total');
confere(m.areas.reduce((s, a) => s + a.n, 0) === m.ds.length, 'áreas não fecham com o total');
confere(m.pis.every((p) => soma(p.est) === p.n), 'estágios de algum PI não fecham com o PI');
confere(Object.keys(m.fora).every((f) => /bloque|cancel/i.test(f)), `fase fora do fluxo e desconhecida: ${Object.keys(m.fora).filter((f) => !/bloque|cancel/i.test(f)).join(', ')}`);
confere(new Set(m.ds.map((d) => d.chave)).size === m.ds.length, 'chave de comparação repetida');

// A regra do Fluxo Macro, como está no README, sobre os campos crus.
const c = E.dia(snap.corte);
const REGRA = {
  backlog: (d) => (d.p_inicio ? 'preparacao' : 'preprojeto'),
  refinamento: () => 'planejamento',
  construcao: () => 'construcao',
  homologacao: () => 'homologacao',
  pronto: (d) => (!d.cab ? 'prepfinal' : E.dia(d.cab) >= c ? 'implantacao' : 'encerramento'),
};
const fora = m.ds.filter((d) => (REGRA[E.faseTipo(d.fase)] ? REGRA[E.faseTipo(d.fase)](d) : null) !== (d.etapa ?? null));
confere(!fora.length, `subfase fora da regra: ${fora.slice(0, 5).map((d) => `${d.id} (${d.fase}) em ${d.etapa}`).join(', ')}`);

// Dias úteis: datas conhecidas do calendário (12/10 e Sexta-feira Santa de 2026 são feriados).
confere(E.diasUteis(E.dia('2026-09-28'), E.dia('2026-10-16')) === 13, 'dias úteis de 28/09 a 16/10/2026 deveriam ser 13 (feriado de 12/10)');
confere(E.diasUteis(E.dia('2026-04-02'), E.dia('2026-04-03')) === 0, 'Sexta-feira Santa de 2026 (03/04) deveria ser feriado');
// Previsão: as que faltam + as prontas, concluídas e canceladas fecham com o PI.
if (m.previsao) {
  const doPI = m.ds.filter((d) => (d.piPlan || 'Sem PI') === m.previsao.pi);
  confere(m.previsao.faltam + doPI.filter((d) => d.tipo === 'pronto' || d.st === 'concluida' || d.st === 'cancelada').length === doPI.length, 'previsão: faltam + prontas/concluídas/canceladas não fecham com o PI');
}
// Agenda de homologação: só demanda que ainda não homologou, até 6 semanas à frente.
confere(m.uat.grupos.flatMap((g) => g.itens).every((x) => !x.d.r_homologacao && x.dias <= 42 && ['backlog', 'refinamento', 'construcao', 'homologacao'].includes(x.d.tipo)), 'agenda de homologação com demanda fora da regra');
confere(m.uat.grupos.reduce((s, g) => s + g.itens.length, 0) === m.uat.total, 'agenda de homologação: grupos não fecham com o total');
// Tempo real de entrega: só concluídas, com fim até o corte.
confere(m.lead.n <= m.concl.length && m.lead.porPI.reduce((s, x) => s + x.n, 0) === m.lead.n, 'tempo de entrega: base não fecha');

// Contas, em aritmética inteira, contra a regra escrita (não contra o próprio núcleo):
// - diasUteis e somaUteis são inversos numa faixa que atravessa Natal, ano novo e Carnaval de 2027;
for (let a = E.dia('2026-12-15'); a <= E.dia('2027-02-15'); a += 3) for (let n = 0; n <= 30; n += 7) {
  if (E.diasUteis(a, E.somaUteis(a, n)) !== n) { confere(false, `diasUteis(somaUteis) falhou em ${a} + ${n}`); break; }
}
// - previsão: a base é a medição mais antiga entre 7 e 28 dias antes, e a data cai em ceil(faltam·du/Δ) dias úteis;
if (m.previsao && m.previsao.base) {
  const pv = m.previsao;
  const validos = pontos.filter((x) => x.corte < snap.corte && c - E.dia(x.corte) >= 7 && c - E.dia(x.corte) <= 28).sort((a, b) => a.corte.localeCompare(b.corte));
  confere(validos[0] && validos[0].corte === pv.base.corte, `previsão: base ${pv.base.corte}, esperada ${validos[0] && validos[0].corte}`);
  if (pv.prevista) confere(E.diasUteis(c, E.dia(pv.prevista)) === Math.ceil((pv.faltam * pv.base.du) / pv.delta), 'previsão: data prevista não cai em ceil(faltam·du/Δ) dias úteis');
}
// - carga: cada hora entra uma vez (dividida entre as pessoas) e o pico é horas ÷ dias úteis até a data dele;
const PAPEIS = { abap: ['abap', 'horasAbap', ['backlog', 'refinamento', 'construcao']], funcional: ['funcional', 'horasFunc', ['backlog', 'refinamento', 'construcao', 'homologacao']] };
for (const [lado, [campo, horas, tipos]] of Object.entries(PAPEIS)) {
  const esperado = m.ds.filter((d) => tipos.includes(d.tipo) && (d[campo] || []).length && d[horas] != null).reduce((s, d) => s + d[horas], 0);
  const somado = m.cargas[lado].reduce((s, o) => s + o.horas + o.semData, 0);
  confere(Math.abs(esperado - somado) < 1e-6, `carga ${lado}: ${somado} h somadas por pessoa, ${esperado} h nas demandas`);
  for (const o of m.cargas[lado].filter((x) => x.pico)) {
    confere(o.pico.du === Math.max(1, E.diasUteis(c, E.dia(o.pico.ate))) && Math.abs(o.pico.porDia * o.pico.du - o.pico.horas) < 1e-6, `carga ${lado}: pico de ${o.nome} não fecha`);
  }
}
// - tempo de entrega: nenhuma duração negativa e mediana ≤ 85% ≤ máximo.
if (m.lead.n) confere(m.lead.mediana >= 0 && (m.lead.p85 == null || (m.lead.mediana <= m.lead.p85 && m.lead.p85 <= m.lead.maximo)), 'tempo de entrega: mediana, 85% e máximo fora de ordem');

console.log(`exportação ${snap.corte} · ${snap.total} demandas · ${snap.colunasAusentes.length} colunas ausentes`);
console.log('situação', m.st);
console.log('etapas  ', Object.fromEntries(m.etapas.map((e) => [e.k, e.n])), 'fora', m.fora);
console.log('horas   ', m.horas);
console.log('PIs     ', m.pis.map((p) => `${p.pi}: ${p.n} (${p.concl} concl., ${p.proprio} no próprio PI, ciclo ${p.ciclo})`).join(' | '));
console.log('aderência', m.aderencia.map((a) => `${a.nome} ${a.ok}/${a.n}`).join(' | '));
console.log('ação    ', m.acao.map((g) => `${g.k} ${g.itens.length}`).join(' | '));
console.log('cadastro', m.cadastro.map((c) => `${c.campo} ${c.itens.length}`).join(' | '));
const pv = m.previsao;
if (pv) console.log('previsão', `${pv.pi}: faltam ${pv.faltam} (${pv.horas} h, ${pv.semEst} sem estimativa, ${pv.semPronto} sem pronto) · último pronto ${pv.ultimo} · ${pv.duAte} dias úteis · necessário ${pv.necessario?.toFixed(2)}/dia · ritmo ${pv.ritmo?.toFixed(2) ?? '—'} (PI ${pv.ritmoPI?.toFixed(2) ?? '—'}) · prevista ${pv.prevista ?? '—'} (PI ${pv.previstaPI ?? '—'}) · folga ${pv.folga ?? '—'}`);
console.log('motivos ', m.motivos);
console.log('tempo   ', `${m.lead.n} entregas (${m.lead.porCab} pela CAB) · mediana ${m.lead.mediana} d · 85% ${m.lead.p85?.toFixed(1)} d · planejado ${m.lead.plan} d + ${m.lead.aposPronto} d até a subida · ${m.lead.porPI.map((x) => `${x.pi} ${x.n}/${x.mediana}`).join(' ')}`);
console.log('UAT     ', `${m.uat.total} em 6 semanas · ${m.uat.vencidas} vencidas · ${m.uat.replanejar} a replanejar · ${m.uat.semData} de ${m.uat.antes} sem data · ${m.uat.grupos.map((g) => `${g.nome} ${g.itens.length}${g.picos.length ? ` (pico ${g.picos.map((x) => `${x.n} em ${x.data}`).join(', ')})` : ''}`).join(' | ')}`);
for (const lado of ['abap', 'funcional']) console.log(`carga ${lado.padEnd(9)}`, m.cargas[lado].filter((o) => o.pico).map((o) => `${o.nome} pico ${o.pico.horas} h/${o.pico.du} du = ${o.porDia.toFixed(1)} até ${o.pico.ate}`).join(' | '));
console.log('status  ', m.acao.map((g) => `${g.k}: ${g.itens.length - g.semStatus}/${g.itens.length} com status`).join(' | '));

if (falhas.length) { console.error(`\nREPROVADO\n- ${falhas.join('\n- ')}`); process.exit(1); }
console.log('\naprovado');
