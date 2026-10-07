# Gato Véio · Sistema de eventos

Painel para organizar os eventos mensais do Gato Véio (vinho, brasa e prosa).

```
Painel (GitHub Pages)  ──►  n8n (Hostinger/Easypanel)  ──►  Planilha Google
                                     └──►  E-mail todo dia às 06h00
```

- **Planilha Google**: o banco de dados. Dá para abrir e editar direto, se precisar.
- **n8n**: confere a senha, lê e grava na planilha, e manda o resumo diário.
- **Painel**: onde vocês trabalham no dia a dia, no celular ou no computador.

## O que tem no painel

| Aba | Para quê |
|---|---|
| **Hoje** | Tarefas de hoje, atrasadas, próximos 3 dias e avisos (prazo de pagamento, espera, pratos sem decisão, receitas incompletas, bebidas sem preço). |
| **Tarefas** | Tudo por data ou por fase. Toque no círculo para concluir; muda data e hora direto na lista. Botão **Gerar plano de produção**. |
| **Reservas** | Uma pessoa por reserva: *Lista* (falta pagar) → *Pago* (lugar confirmado); *Espera* por ordem de chegada; *Desistiu*. Avisa quando o prazo passa. |
| **Cardápio** | Pratos do evento na ordem de serviço, porções por pessoa, status (Candidato, Em teste, Aprovado, Descartado), anotações do teste e harmonização. |
| **Receitas** | O livro de receitas: rendimento, ingredientes e **passos** (quantos dias ou horas antes, duração, equipamento, como guardar). Fica guardado para os próximos eventos. |
| **Compras** | **Gerar lista**: receitas aprovadas × pessoas, ingredientes somados e convertidos para a unidade de compra, separados por açougue, feira, mercado… Marque *Já tenho* ou *Comprado*. Itens avulsos também. |
| **Bebidas** | Rótulos, fornecedor, consignado ou comprado, custo e preços (taça = 150 ml). No dia seguinte: devolvidas → **acerto com cada vinícola**. |
| **Evento** | Dados do evento, custos extras (ajudante, fogueira…), total das comandas e **fechamento** (resultado). Criar **novo evento**. |
| **Cadastros** | Pessoas, fornecedores, ingredientes (conversões de compra) e o **modelo de tarefas** dos próximos eventos. |

### Como as contas funcionam
- **Lista de mercado:** para cada prato *Aprovado*, pessoas × porções por pessoa ÷ rendimento × quantidade do ingrediente. Depois converte para a unidade de compra (ex.: 1 colher de cebola roxa = 0,25 cebola) e arredonda para cima quando o item é comprado inteiro.
- **Plano de produção:** cada passo das receitas aprovadas vira uma tarefa. "2 dias antes" vira a data; "3 horas antes" vira o horário no dia, contado a partir do início do evento. Gerar de novo atualiza sem duplicar.
- **Novo evento:** sugere o último sábado do mês e o prazo de pagamento no dia 15, e cria as tarefas do modelo. **D** conta a partir do evento, **P** a partir do prazo de pagamento e **H** em horas no dia. Prazos que caem no fim de semana vão para a sexta. Depois é só revisar em Tarefas.

## Instalação (uma vez)

### 1. Planilha
1. Suba `gato-veio-planilha.xlsx` no Google Drive.
2. Abra e use **Arquivo → Salvar como Planilhas Google**. A partir daí, use essa versão.
3. Copie o **ID** da planilha: a parte do link entre `/d/` e `/edit`.
4. Não renomeie as abas nem os títulos da primeira linha.

### 2. n8n
1. **Workflows → Import from File** → `workflow-n8n-gato-veio.json`.
2. Abra o nó **Configuração** e preencha o bloco do topo:
   - `senha`: a senha que vocês vão digitar no painel;
   - `planilha`: o ID do passo anterior;
   - `email`: já vem com verlaiconsultoria@gmail.com;
   - `painel`: o link do painel, opcional, para o e-mail ter um botão.
3. Credenciais:
   - **Ler planilha** (HTTP Request): *Credential type* = **Google Sheets OAuth2 API**. Use a mesma conta Google dona da planilha.
   - **Gravar na planilha**: a mesma credencial do Google Sheets.
   - **Enviar e-mail**: a credencial do Gmail.
4. **Ative** o workflow e desative os antigos, para não chegar e-mail duplicado.
5. Abra o nó **Painel (webhook)** e copie a **Production URL**. Ela termina em `/webhook/gato-veio`. A parte até `/webhook` é o endereço do painel.

No Easypanel, confira estas variáveis:
- `WEBHOOK_URL` com o domínio público do n8n, para a Production URL sair certa;
- `GENERIC_TIMEZONE=America/Sao_Paulo`, para o e-mail sair às 6h de Brasília.

### 3. Painel (GitHub Pages)
1. No `config.js`, coloque o endereço sem barra no final:
   ```js
   window.GATO_CONFIG = { n8n: 'https://seu-n8n.com.br/webhook' };
   ```
2. Substitua os arquivos do repositório por estes: `index.html`, `style.css`, `app.js`, `config.js`, `logo.webp`, `seed.json`. Os antigos `data.json` e `README` podem ser apagados.
3. **Settings → Pages**, publique a branch principal.
4. Abra o link, digite a senha e confira se o topo mostra **● planilha em dia**.

O link do GitHub Pages é público, mas os dados não: sem a senha o n8n não entrega nada. A senha fica salva no navegador depois do primeiro acesso; o botão **Sair** fica na aba Evento.

## Uso no mês
1. **Ideia:** aba Evento → Novo evento → revisar prazos em Tarefas → custos extras.
2. **Divulgação:** registrar quem chega em Reservas; marcar **Pagou** quando pagar.
3. **Testes:** pratos no Cardápio; anotar o resultado; aprovar ou descartar.
4. **Receitas:** cadastrar ingredientes e passos dos aprovados.
5. **Prazo de pagamento:** liberar as vagas de quem não pagou para a espera.
6. **Compras:** Gerar lista com os pagos, riscar o que já tem e ir às compras.
7. **Produção:** Gerar plano de produção; os passos aparecem em Tarefas e no e-mail.
8. **Dia seguinte:** devolvidas em Bebidas, total das comandas em Evento, fechamento.

## Modo de teste
Com `n8n: ''` no `config.js`, o painel abre com os dados do evento de outubro (`seed.json`), salvos só naquele navegador. Abra por um servidor (GitHub Pages ou `python3 -m http.server`), não clicando direto no arquivo.

## Pasta `tools/`
Scripts que geram a planilha, os dados iniciais e o workflow (`build_seed.py`, `build_workflow.py`). Não precisam ir para o GitHub Pages.
