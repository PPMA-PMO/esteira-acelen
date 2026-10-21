// Confere o núcleo do report (o <script id="nucleo"> do index.html) contra uma exportação real.
//
//   node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx>             imprime os números e confere as partições
//   node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx> --controle  estraga uma demanda e PRECISA reprovar
//
// Roda o mesmo código que a página roda; nada de reimplementar a regra aqui. O que se confere
// são invariantes que valem para qualquer exportação: cada demanda cai em exatamente uma
// situação e em no máximo uma etapa do fluxo, e as somas de cada seção fecham com o total.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [arquivo, modo] = process.argv.slice(2);
if (!arquivo) { console.error('uso: node confere.mjs <exportacao.xlsx> [--controle]'); process.exit(2); }

const html = readFileSync(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
const nucleo = /<script id="nucleo">([\s\S]*?)<\/script>/.exec(html)[1];
new Function(nucleo)();
const E = globalThis.Esteira;

const buf = readFileSync(arquivo);
const snap = E.normalizar(await E.lerXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), arquivo);
if (modo === '--controle') snap.demandas[0].fase = 'Fase que não existe';
const m = E.analisar(snap, null);

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

console.log(`exportação ${snap.corte} · ${snap.total} demandas · ${snap.colunasAusentes.length} colunas ausentes`);
console.log('situação', m.st);
console.log('etapas  ', Object.fromEntries(m.etapas.map((e) => [e.k, e.n])), 'fora', m.fora);
console.log('horas   ', m.horas);
console.log('PIs     ', m.pis.map((p) => `${p.pi}: ${p.n} (${p.concl} concl., ${p.proprio} no próprio PI, ciclo ${p.ciclo})`).join(' | '));
console.log('aderência', m.aderencia.map((a) => `${a.nome} ${a.ok}/${a.n}`).join(' | '));
console.log('ação    ', m.acao.map((g) => `${g.k} ${g.itens.length}`).join(' | '));
console.log('cadastro', m.cadastro.map((c) => `${c.campo} ${c.itens.length}`).join(' | '));

if (falhas.length) { console.error(`\nREPROVADO\n- ${falhas.join('\n- ')}`); process.exit(1); }
console.log('\naprovado');
