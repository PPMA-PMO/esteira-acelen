# Esteira Acelen — report

Report da esteira de melhorias SAP da Acelen, calculado da exportação da lista
**Cadastro de Melhorias** (SharePoint). Uma página só (`index.html`), desenho PPMA v2
(`design/tokens-v2.css`), sem dependência e sem dado da Acelen dentro do repositório.

Publicado em https://claude.ai/artifact/Qkiyaov1fzmR1eHNp2KqTm — ali as exportações carregadas
ficam guardadas e a seção de mudanças compara cada semana com a anterior.

## Uso, toda semana

1. No SharePoint, exportar a lista Cadastro de Melhorias para Excel.
2. Abrir o report e clicar em **Carregar exportação** (ou soltar o .xlsx na página).
3. A data de corte é a data em que a planilha foi exportada (propriedade do arquivo), não a de hoje.

Aberto direto do disco, o `index.html` lê o arquivo no navegador e não guarda nada.

## O que está separado do app

Fica fora do build do Vite e do lint (só entram `index.html` da raiz e `src/`). Nada aqui
lê ou escreve no Supabase do PPMA.

## Regras que o report aplica

- **Prazo de demanda aberta** = a data planejada que encerra a fase atual
  (Backlog → Data de Início · Em Refinamento → Data de Entrega Refinamento ·
  Em Construção → Data de Entrega Construção · Em Homologação → Data de Entrega Homologação ·
  Pronto/Em Encerramento → Data CAB). Sem essa data, a demanda é "sem data" e não entra na conta de atraso.
- **Fluxo Macro dos Projetos** do PMO: 4 fases e 8 subfases — Iniciação (Pré Projeto, Preparação),
  Planejamento (Planejamento), Execução (Construção, Homologação, Preparação final, Implantação),
  Encerramento (Encerramento). A lista tem fases próprias, e duas se dividem por data:
  Backlog sem Data de Início é Pré Projeto, com data é Preparação; Pronto/Em Encerramento sem
  Data CAB é Preparação final, com CAB futura é Implantação, com CAB que já passou é Encerramento.
  Em Refinamento é Planejamento. Concluídas saíram do fluxo; bloqueadas e canceladas ficam fora dele.
  A tabela fica em `ETAPAS`, no núcleo.
- **Leitura da semana**: frases de modelo fixo preenchidas por regra. Fila = demandas em Planejamento,
  Construção e Homologação × prontas sem encerrar; Prazo = a fase medida (5 ou mais) com menor e maior
  % no prazo, com a ressalva de cobertura; PI = PI anterior com o último pronto planejado vencido e
  demanda aberta, e o PI em execução; Pedido = o grupo de Pedem ação (fora "vencem em 7 dias", 3 ou mais
  demandas) com mais horas. "Copiar texto da semana" leva isso, os grupos de Pedem ação, as mudanças
  desde a exportação anterior e as próximas 2 semanas.
- **Cobertura do prazo planejado × real**: medidas ÷ demandas que já passaram da fase (ou têm a data
  real dela). PI com 5 ou mais que passaram e menos da metade medida aparece como "pouco medido".
- **Cobrar** (seção Pessoas): copia as abertas da pessoa com o pedido de cada uma (encerrar, atualizar a
  fase, agendar a CAB, preencher data, status report ou horas). Sem tabela de quem faz o quê por papel,
  o pedido vale para todas as pessoas da demanda.
- **Prazo planejado × real**, **cadência por PI**, **CABs por mês**, **área × PI**, **pessoas**,
  **replanejamento** e **qualidade do cadastro** seguem o método do board executivo de 28/09/2026.
- **Fechamento do PI**: ritmo necessário (faltam ÷ dias úteis até o último pronto planejado) e ritmo
  real (aumento de prontas ou concluídas na esteira toda ÷ dias úteis desde a medição mais antiga das
  últimas 4 semanas). As medições são as exportações guardadas e as referências declaradas no
  documento `referencias/ritmo` do artifact (hoje, o board de 28/09: 95 de 114). Dias úteis:
  segunda a sexta sem feriados nacionais.
- **Carga até a construção**: horas Funcional/ABAP das demandas em Backlog, Em Refinamento e
  Em Construção ÷ dias úteis até a última data de fim de construção da pessoa. É teto, não saldo:
  a lista não tem horas apontadas.
- **Agenda de homologação**: Data de Entrega Homologação das demandas que ainda não homologaram,
  6 semanas à frente, por responsável Acelen.
- **Tempo real de entrega**: Data Início Real até Data Concluído Real (ou Data CAB), nas concluídas;
  mediana e 85%.

## Conferir

```bash
node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx>              # imprime os números, confere as partições
node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx> --controle          # fase desconhecida: precisa reprovar
node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx> --controle-subfase  # demanda na subfase errada: precisa reprovar
node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx> --controle-calculo  # conta de carga errada: precisa reprovar
node relatorios/esteira-acelen/confere.mjs <exportacao.xlsx> --controle-leitura  # cobertura e pedido errados: precisa reprovar
```

O verificador roda o mesmo `<script id="nucleo">` da página e confere a subfase de cada demanda
contra a regra escrita sobre os campos crus. Na exportação de 16/10/2026
(148 demandas) os números foram conferidos contra um cálculo independente em pandas.
