/* Gato Véio · Painel de eventos
 * Banco de dados: Google Sheets, acessado pelo n8n (config.js).
 * Sem n8n configurado: modo de teste com seed.json, salvo só neste navegador.
 */
'use strict';

const API = String((window.GATO_CONFIG || {}).n8n || '').trim().replace(/\/+$/, '');
const MODE = API ? 'n8n' : 'local';
const K = { cache: 'gv3-cache', local: 'gv3-local', queue: 'gv3-fila', ev: 'gv3-evento', prefs: 'gv3-prefs', senha: 'gv3-senha' };

const COLS = {
  Eventos:        ['id','nome','tema','formato','data','hora','capacidade','valor_ingresso','prazo_pagamento','status','vendas_bebidas','notas','excluido'],
  Tarefas:        ['id','evento_id','fase','tarefa','data','hora','status','origem','nota','excluido'],
  Reservas:       ['id','evento_id','pessoa_id','status','entrada','pagamento','valor_pago','observacao','excluido'],
  Pessoas:        ['id','nome','telefone','instagram','restricao','observacoes','excluido'],
  Cardapio:       ['id','evento_id','receita_id','ordem','porcoes_pessoa','status','teste','bebida_id','excluido'],
  Receitas:       ['id','nome','categoria','rende','status','preparo','observacoes','excluido'],
  Receita_Itens:  ['id','receita_id','ingrediente_id','quantidade','observacao','excluido'],
  Receita_Passos: ['id','receita_id','ordem','passo','quando','antes','duracao_min','equipamento','conservacao','excluido'],
  Ingredientes:   ['id','nome','unidade','compra_unidade','compra_fator','arredondar','onde_comprar','excluido'],
  Bebidas:        ['id','evento_id','fornecedor_id','rotulo','tipo','modalidade','custo_garrafa','preco_garrafa','preco_taca','recebidas','devolvidas','observacao','excluido'],
  Fornecedores:   ['id','nome','tipo','cidade','contato','observacoes','excluido'],
  Compras:        ['id','evento_id','ingrediente_id','item','quantidade','unidade','onde_comprar','status','custo','origem','observacao','excluido'],
  Custos:         ['id','evento_id','descricao','categoria','valor','pago','excluido'],
  Modelo_Tarefas: ['id','fase','tarefa','ref','desloc','nota','excluido'],
};
const DATE_FIELDS = ['data', 'prazo_pagamento', 'entrada', 'pagamento'];

const L = {
  fases: ['Ideia','Divulgação','Vinhos','Cardápio','Produção','Compras','Clima','Dia do evento','Dia seguinte'],
  tarefa: ['Em aberto','Feito'],
  reserva: ['Lista','Pago','Espera','Desistiu'],
  prato: ['Candidato','Em teste','Aprovado','Descartado'],
  receita: ['Rascunho','Em teste','Testada'],
  categorias: ['Entrada','Petisco','Principal','Acompanhamento','Molho','Massa/Pão','Sobremesa','Bebida'],
  unidades: ['colher','colher chá','xícara','g','kg','ml','l','un','maço','dente','fatia','pitada','a gosto'],
  onde: ['Açougue','Feira','Mercado','Empório','Atacado','Padaria','Vinícola','Outro'],
  compra: ['Comprar','Já tenho','Comprado'],
  equip: ['Fogão','Forno','Fritadeira','Churrasqueira','Fogueira','Congelador','Geladeira','Faca/bancada','Liquidificador','Batedeira'],
  bebidaTipo: ['Tinto','Branco','Rosé','Espumante','Laranja','Sobremesa','Cerveja','Outra'],
  modalidade: ['Consignado','Comprado'],
  evento: ['Ideia','Divulgação','Preparação','Realizado','Fechado','Cancelado'],
  formato: ['Comida à vontade','Cozinha ao vivo','Menu em etapas','Formal'],
  custoCat: ['Pessoal','Estrutura','Gelo','Gás','Decoração','Descartáveis','Transporte','Outro'],
  fornTipo: ['Vinícola','Importadora','Açougue','Mercado','Feira','Empório','Outro'],
};
const TACAS = 5; // 750 ml ÷ 150 ml

let DB = null, evId = null, page = 'hoje', queue = [], flushing = false, recSel = null;
let prefs = load(K.prefs, {});
prefs = { tarefasPor: 'data', ocultarFeitas: false, base: 'auto', baseN: '', cad: 'pessoas', busca: '', ...prefs };

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } }
function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const savePrefs = () => store(K.prefs, prefs);
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
function normDate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v))) return new Date(Date.UTC(1899, 11, 30) + Number(v) * 864e5).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}
function normTime(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' || /^0?\.\d+$/.test(String(v))) { const t = Math.round(Number(v) * 1440); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; }
  const m = String(v).match(/^(\d{1,2})[:h](\d{2})?/); return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : '';
}
function num(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s); return Number.isFinite(n) ? n : null;
}
const fmtNum = (n, d = 2) => n == null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: d });
const money = n => n == null ? '—' : 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const addDays = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);
const DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dowOf = iso => new Date(iso + 'T12:00:00Z').getUTCDay();
const fmt = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—';
const fmtLong = iso => iso ? `${DOW[dowOf(iso)]} ${fmt(iso)}` : 'sem data';
const minutes = hhmm => { const t = normTime(hhmm); if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = mins => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.round(mins % 60)).padStart(2, '0')}`;
const live = r => String(r.excluido || '').trim().toLowerCase() !== 'sim';
const uid = p => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const opts = (list, cur, blank) => (blank != null ? `<option value="">${esc(blank)}</option>` : '') +
  list.map(o => Array.isArray(o) ? `<option value="${esc(o[0])}" ${String(o[0]) === String(cur) ? 'selected' : ''}>${esc(o[1])}</option>`
                                 : `<option ${String(o) === String(cur) ? 'selected' : ''}>${esc(o)}</option>`).join('') +
  (cur && !list.some(o => String(Array.isArray(o) ? o[0] : o) === String(cur)) ? `<option selected>${esc(cur)}</option>` : '');
const datalist = (id, list) => `<datalist id="${id}">${list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2400); }

/* ---------- dados e sincronização ---------- */
function normalize(db) {
  const out = {};
  for (const tab of Object.keys(COLS)) {
    out[tab] = (db?.[tab] || []).filter(r => r && r.id !== '' && r.id != null).map(r => {
      const o = {}; COLS[tab].forEach(c => o[c] = r[c] == null ? '' : String(r[c])); o.id = String(r.id); return o;
    });
  }
  for (const tab of Object.keys(out)) out[tab].forEach(r => {
    DATE_FIELDS.forEach(f => { if (f in r) r[f] = normDate(r[f]); });
    if ('hora' in r) r.hora = normTime(r.hora);
  });
  return out;
}
const byId = (tab, id) => DB[tab].find(r => r.id === id);
function put(tab, rec) { const i = DB[tab].findIndex(r => r.id === rec.id); if (i >= 0) DB[tab][i] = rec; else DB[tab].push(rec); }
function clean(tab, r) { const o = {}; COLS[tab].forEach(c => o[c] = r[c] == null ? '' : String(r[c])); return o; }

function save(tab, recs, quiet) {
  if (!recs.length) return;
  recs = recs.map(r => clean(tab, r));
  recs.forEach(r => put(tab, r));
  if (MODE === 'local') { store(K.local, DB); if (!quiet) toast('Salvo neste navegador'); return; }
  store(K.cache, DB);
  for (let i = 0; i < recs.length; i += 200) queue.push({ aba: tab, registros: recs.slice(i, i + 200) });
  store(K.queue, queue); flush();
}
async function api(acao, extra = {}) {
  // text/plain evita a "consulta prévia" (CORS) do navegador; o n8n lê o texto como JSON.
  let r;
  try {
    r = await fetch(API + '/gato-veio', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ senha: load(K.senha, ''), acao, ...extra }) });
  } catch (e) { const err = new Error('sem resposta do n8n'); err.net = true; throw err; }
  if (r.status === 401) { const e = new Error('Senha incorreta'); e.auth = true; throw e; }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const txt = await r.text(); try { return JSON.parse(txt); } catch { return {}; }
}
async function flush() {
  if (flushing || MODE !== 'n8n') return;
  flushing = true; setSync();
  while (queue.length) {
    try { await api('salvar', queue[0]); queue.shift(); store(K.queue, queue); }
    catch (e) { flushing = false; setSync(e); if (e.auth) showLogin('A senha mudou. Entre de novo.'); return; }
  }
  flushing = false; setSync();
}
function setSync(err) {
  const s = $('#sync');
  if (MODE === 'local') { s.className = 'sync'; s.textContent = 'modo de teste · só neste navegador'; return; }
  if (err || (queue.length && !flushing)) { s.className = 'sync err'; s.textContent = `${queue.length} alteração(ões) não salva(s) · tentar de novo`; s.title = err ? err.message : ''; return; }
  if (flushing) { s.className = 'sync busy'; s.textContent = 'salvando…'; return; }
  s.className = 'sync ok'; s.textContent = '● planilha em dia'; s.title = 'Toque para buscar as últimas alterações';
}
async function fetchDB() {
  if (MODE === 'local') {
    let d = load(K.local, null);
    if (!d) { const r = await fetch('seed.json', { cache: 'no-cache' }); d = await r.json(); store(K.local, d); }
    return normalize(d);
  }
  try {
    let d = await api('ler'); if (Array.isArray(d)) d = d[0];
    const db = normalize(d);
    for (const job of queue) job.registros.forEach(rec => { const i = db[job.aba].findIndex(x => x.id === rec.id); if (i >= 0) db[job.aba][i] = rec; else db[job.aba].push(rec); });
    store(K.cache, db); return db;
  } catch (e) {
    if (e.auth) throw e;
    const c = load(K.cache, null);
    if (c) { toast('Sem conexão com o n8n: mostrando a última cópia'); return normalize(c); }
    throw e;
  }
}

/* ---------- consultas ---------- */
const events = () => DB.Eventos.filter(live).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
const ev = () => byId('Eventos', evId) || {};
const of = tab => DB[tab].filter(r => r.evento_id === evId && live(r));
const pessoa = id => byId('Pessoas', id) || { nome: '(sem nome)' };
const receita = id => byId('Receitas', id);
const ingrediente = id => byId('Ingredientes', id);
const itensDe = rid => DB.Receita_Itens.filter(i => live(i) && i.receita_id === rid);
const passosDe = rid => DB.Receita_Passos.filter(p => live(p) && p.receita_id === rid).sort((a, b) => (num(a.ordem) ?? 99) - (num(b.ordem) ?? 99));
const faseIdx = f => { const i = L.fases.indexOf(f); return i < 0 ? 99 : i; };
const isDone = t => t.status === 'Feito';
function tasks() {
  return of('Tarefas').sort((a, b) => (a.data || '9').localeCompare(b.data || '9') || (a.hora || '99').localeCompare(b.hora || '99') || faseIdx(a.fase) - faseIdx(b.fase));
}
function reservas() {
  const rs = of('Reservas'), by = s => rs.filter(r => r.status === s).sort((a, b) => (a.entrada || '').localeCompare(b.entrada || '') || a.id.localeCompare(b.id));
  const cap = num(ev().capacidade) || 0, pagos = by('Pago');
  return { all: rs, pagos, lista: by('Lista'), espera: by('Espera'), desist: by('Desistiu'), cap, vagas: Math.max(cap - pagos.length, 0) };
}
const valorReserva = r => num(r.valor_pago) ?? num(ev().valor_ingresso) ?? 0;
function basePessoas() {
  const r = reservas();
  if (prefs.base === 'pagos') return { n: r.pagos.length, label: 'pagos' };
  if (prefs.base === 'capacidade') return { n: r.cap, label: 'capacidade' };
  if (prefs.base === 'outro') return { n: num(prefs.baseN) || 0, label: 'número escolhido' };
  return r.pagos.length ? { n: r.pagos.length, label: 'pagos' } : { n: r.cap, label: 'capacidade (ninguém pagou ainda)' };
}
function receitaIncompleta(r) {
  const falta = [];
  if (!num(r.rende)) falta.push('rendimento');
  if (!itensDe(r.id).length) falta.push('ingredientes');
  if (!passosDe(r.id).length) falta.push('passos');
  return falta;
}
function bebidaCalc(b) {
  const custo = num(b.custo_garrafa), rec = num(b.recebidas), dev = num(b.devolvidas);
  // Consignado: só vira custo depois que a devolução for informada (mesmo que seja 0).
  const consignado = b.modalidade !== 'Comprado';
  const aguardando = consignado && rec != null && dev == null;
  const consumidas = rec == null || aguardando ? null : (consignado ? rec - dev : rec);
  return { custo, consumidas, aguardando,
    pagar: custo != null && consumidas != null ? custo * consumidas : null,
    pendente: aguardando && custo != null ? custo * rec : 0,
    custoTaca: custo != null ? custo / TACAS : null,
    margemGarrafa: custo != null && num(b.preco_garrafa) != null ? num(b.preco_garrafa) - custo : null,
    margemTaca: custo != null && num(b.preco_taca) != null ? num(b.preco_taca) - custo / TACAS : null };
}
function fechamento() {
  const r = reservas();
  const ingressos = r.pagos.reduce((s, x) => s + valorReserva(x), 0);
  const bebidasVendidas = num(ev().vendas_bebidas) || 0;
  const compras = of('Compras').reduce((s, c) => s + (num(c.custo) || 0), 0);
  const custos = of('Custos').reduce((s, c) => s + (num(c.valor) || 0), 0);
  const vinicolas = of('Bebidas').reduce((s, b) => s + (bebidaCalc(b).pagar || 0), 0);
  const vinicolasPendente = of('Bebidas').reduce((s, b) => s + bebidaCalc(b).pendente, 0);
  return { ingressos, bebidasVendidas, compras, custos, vinicolas, vinicolasPendente, resultado: ingressos + bebidasVendidas - compras - custos - vinicolas };
}
function pickEvent() {
  const list = events(), saved = load(K.ev, null);
  if (saved && list.some(e => e.id === saved)) return saved;
  const t = today(), next = list.find(e => e.data >= addDays(t, -3) && !['Cancelado', 'Fechado'].includes(e.status));
  return (next || list[list.length - 1] || {}).id || null;
}

/* ---------- gerações automáticas ---------- */
function shoppingNeeds(pessoas) {
  const needs = {}, skipped = [];
  for (const c of of('Cardapio').filter(c => c.status === 'Aprovado')) {
    const r = receita(c.receita_id), pp = num(c.porcoes_pessoa), rende = num(r?.rende), itens = r ? itensDe(r.id) : [];
    if (!r || !pp || !rende || !itens.length) { skipped.push(r ? r.nome : '(sem receita)'); continue; }
    const f = pessoas * pp / rende;
    for (const i of itens) {
      const g = ingrediente(i.ingrediente_id); if (!g) continue;
      const n = needs[g.id] ||= { ing: g, qtd: 0, gosto: false, receitas: new Set() };
      const q = num(i.quantidade);
      if (q == null) n.gosto = true; else n.qtd += q * f;
      n.receitas.add(r.nome);
    }
  }
  return { needs: Object.values(needs), skipped };
}
function toBuy(n) {
  const g = n.ing;
  if (!n.qtd) return { quantidade: '', unidade: 'a gosto' };
  const fc = num(g.compra_fator);
  if (g.compra_unidade && fc) {
    let q = n.qtd * fc; q = g.arredondar === 'sim' ? Math.ceil(q - 1e-9) : Math.round(q * 100) / 100;
    return { quantidade: fmtNum(q), unidade: g.compra_unidade };
  }
  return { quantidade: fmtNum(Math.round(n.qtd * 100) / 100), unidade: g.unidade };
}
function gerarCompras() {
  const base = basePessoas();
  if (!base.n) return toast('Defina a capacidade ou marque quem pagou');
  const { needs, skipped } = shoppingNeeds(base.n);
  const existing = of('Compras').filter(c => c.origem === 'Gerada'), keep = new Set(), recs = [];
  for (const n of needs) {
    const id = `${evId}_cmp_${n.ing.id}`, old = byId('Compras', id), q = toBuy(n); keep.add(id);
    recs.push({ ...(old || { status: 'Comprar', custo: '' }), id, evento_id: evId, ingrediente_id: n.ing.id, item: n.ing.nome,
      quantidade: q.quantidade, unidade: q.unidade, onde_comprar: n.ing.onde_comprar || 'Mercado', origem: 'Gerada',
      observacao: `${[...n.receitas].join(', ')} · ${base.n} pessoas`, excluido: '' });
  }
  existing.filter(c => !keep.has(c.id) && c.status === 'Comprar').forEach(c => recs.push({ ...c, excluido: 'sim' }));
  save('Compras', recs, true);
  render();
  toast(`Lista gerada para ${base.n} pessoas` + (skipped.length ? ` · ${skipped.length} prato(s) aprovado(s) sem receita completa` : ''));
}
function gerarProducao() {
  const e = ev(); if (!e.data) return toast('O evento precisa de data');
  const start = minutes(e.hora) ?? 19 * 60, recs = [], keep = new Set(), skipped = [];
  for (const c of of('Cardapio').filter(c => c.status === 'Aprovado')) {
    const r = receita(c.receita_id); if (!r) continue;
    const ps = passosDe(r.id); if (!ps.length) { skipped.push(r.nome); continue; }
    for (const p of ps) {
      const id = `${evId}_prod_${p.id}`, old = byId('Tarefas', id), antes = num(p.antes) || 0; keep.add(id);
      const [data, hora] = p.quando === 'dias' ? [addDays(e.data, -Math.round(antes)), ''] : [e.data, hhmm(Math.max(start - antes * 60, 0))];
      const nota = [p.duracao_min && `${p.duracao_min} min`, p.equipamento, p.conservacao && `guardar: ${p.conservacao}`].filter(Boolean).join(' · ');
      recs.push({ ...(old || { status: 'Em aberto' }), id, evento_id: evId, fase: 'Produção', tarefa: `${r.nome}: ${p.passo}`,
        data, hora, origem: 'Produção', nota, excluido: '' });
    }
  }
  of('Tarefas').filter(t => t.origem === 'Produção' && !keep.has(t.id) && !isDone(t)).forEach(t => recs.push({ ...t, excluido: 'sim' }));
  save('Tarefas', recs, true); render();
  toast(`Plano de produção: ${keep.size} passo(s)` + (skipped.length ? ` · sem passos: ${skipped.join(', ')}` : ''));
}
function lastSaturday(y, m) { const d = new Date(Date.UTC(y, m + 1, 0, 12)); while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }
function sugestaoNovoEvento() {
  const last = events().slice(-1)[0], base = last?.data ? new Date(last.data + 'T12:00:00Z') : new Date();
  let y = base.getUTCFullYear(), m = base.getUTCMonth() + (last ? 1 : 0); if (m > 11) { m = 0; y++; }
  const data = lastSaturday(y, m);
  return { data, prazo: data.slice(0, 8) + '15' };
}
function criarEvento(f) {
  const data = normDate(f.get('data')), prazo = normDate(f.get('prazo')), hora = normTime(f.get('hora')) || '19:00';
  if (!data) return toast('Escolha a data');
  let id = 'ev-' + data.slice(0, 7); while (DB.Eventos.some(x => x.id === id)) id += 'b';
  save('Eventos', [{ id, nome: f.get('nome').trim() || 'Gato Véio', tema: f.get('tema'), formato: f.get('formato'), data, hora,
    capacidade: f.get('capacidade'), valor_ingresso: f.get('valor'), prazo_pagamento: prazo, status: 'Ideia', vendas_bebidas: '', notas: '', excluido: '' }], true);
  const start = minutes(hora);
  const tasksNew = DB.Modelo_Tarefas.filter(live).map((m, i) => {
    const d = num(m.desloc) || 0; let dt = '', hr = '';
    if (m.ref === 'H') { dt = data; hr = hhmm(Math.max(start + d * 60, 0)); }
    else {
      const ref = m.ref === 'P' ? (prazo || data) : data; dt = addDays(ref, Math.round(d));
      if (Math.abs(d) >= 2) { const w = dowOf(dt); if (w === 6) dt = addDays(dt, -1); if (w === 0) dt = addDays(dt, -2); }
    }
    return { id: `${id}_t${String(i + 1).padStart(2, '0')}`, evento_id: id, fase: m.fase, tarefa: m.tarefa, data: dt, hora: hr, status: 'Em aberto', origem: 'Modelo', nota: m.nota, excluido: '' };
  });
  save('Tarefas', tasksNew, true);
  evId = id; store(K.ev, id); page = 'tarefas'; prefs.tarefasPor = 'fase'; savePrefs(); render();
  toast('Evento criado. Revise os prazos sugeridos.');
}

/* ---------- componentes ---------- */
const head = (title, sub, actions = '') => `<div class="head"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="actions">${actions}</div>` : ''}</div>`;
function field(tab, r, c) {
  const de = `data-e="${tab}|${esc(r.id)}|${c.f}"`, v = r[c.f] ?? '';
  let input;
  if (c.t === 'select') input = `<select ${de}>${opts(c.o, v, c.blank)}</select>`;
  else if (c.t === 'textarea') input = `<textarea ${de} placeholder="${esc(c.ph || '')}">${esc(v)}</textarea>`;
  else input = `<input ${de} type="${c.t === 'num' ? 'text' : c.t || 'text'}" ${c.t === 'num' ? 'inputmode="decimal"' : ''} value="${esc(v)}" ${c.list ? `list="${c.list}"` : ''} placeholder="${esc(c.ph || '')}">`;
  return `<label class="f ${c.wide ? 'wide' : ''}" style="--w:${c.w || 2}">${esc(c.l)}${input}</label>`;
}
const cell = (html, w = 2, wide) => `<div class="cell ${wide ? 'wide' : ''}" style="--w:${w}">${html}</div>`;
const xbtn = (tab, id, what = 'registro') => `<div class="x"><button class="xbtn" data-del="${tab}|${esc(id)}" title="Remover ${what}" aria-label="Remover ${what}">✕</button></div>`;
const row = (inner, cls = '') => `<div class="row ${cls}">${inner}</div>`;
const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
const PILL = {
  Pago: 'ok', Lista: 'wait', Espera: '', Desistiu: 'off',
  Aprovado: 'ok', 'Em teste': 'wait', Candidato: '', Descartado: 'off',
  Comprado: 'ok', 'Já tenho': 'ok', Comprar: 'wait',
};
// Linha de lista: toque abre o editor. `lead` = controle à esquerda (ex.: marcar), `end` = valores à direita.
function item({ open, lead = '', title, sub = '', end = '', cls = '' }) {
  return `<div class="item ${cls}">${lead}<div class="item-main" role="button" tabindex="0" data-open="${esc(open)}">
    <div class="item-text"><span class="item-title">${title}</span>${sub ? `<span class="item-sub">${sub}</span>` : ''}</div>
    ${end ? `<div class="item-end">${end}</div>` : ''}</div></div>`;
}
const section = (title, body, extra = '') => `<section class="sheet">${title ? `<div class="sheet-h"><h3>${title}</h3>${extra}</div>` : ''}${body}</section>`;
const emptyMsg = t => `<p class="empty">${t}</p>`;

function taskHTML(t, o = {}) {
  const late = t.data && t.data < today() && !isDone(t);
  const when = [o.date && t.data ? fmtLong(t.data) : '', t.hora].filter(Boolean).join(' às ');
  const meta = [when, t.fase].filter(Boolean).join('  ·  ');
  return `<div class="task ${isDone(t) ? 'done' : ''}">
    <button class="check ${isDone(t) ? 'on' : ''}" data-done="${esc(t.id)}" aria-label="${isDone(t) ? 'Reabrir' : 'Concluir'}">${isDone(t) ? '✓' : ''}</button>
    <div class="task-body" role="button" tabindex="0" data-edit-task="${esc(t.id)}">
      <span class="task-title">${esc(t.tarefa)}</span>
      <span class="task-meta">${late ? '<b class="late-txt">atrasada</b> ' : ''}${esc(meta)}</span>
      ${t.nota ? `<span class="note-txt">${esc(t.nota)}</span>` : ''}
    </div>
  </div>`;
}

/* ---------- telas ---------- */
function render() {
  const e = ev();
  $('#ev-name').textContent = e.nome || 'Gato Véio';
  if (e.data) {
    const d = diffDays(e.data, today()), r = reservas(), ts = tasks();
    $('#ev-when').textContent = `${fmtLong(e.data)}/${e.data.slice(0, 4)} às ${e.hora || '—'}${e.tema ? ` · ${e.tema}` : ''}`;
    $('#stats').innerHTML = `<span class="count">${d > 0 ? `faltam <b>${d}</b> dia${d > 1 ? 's' : ''}` : d === 0 ? '<b>é hoje!</b>' : `foi há ${-d} dia${d < -1 ? 's' : ''}`}</span>
      <span>${r.pagos.length} de ${r.cap || '?'} pagos</span><span>${ts.filter(isDone).length} de ${ts.length} tarefas</span>`;
  } else { $('#ev-when').textContent = 'Nenhum evento ainda. Crie o primeiro na aba Evento.'; $('#stats').innerHTML = ''; }
  setSync();
  if (!evId && !['evento', 'receitas', 'cadastros'].includes(page)) page = 'evento';
  document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('active', b.dataset.page === page); b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'); });
  ({ hoje, tarefas, reservas: telaReservas, cardapio, receitas: telaReceitas, compras, bebidas, evento: telaEvento, cadastros })[page]();
}

function periodo() {
  const t0 = today(), e = ev(), p = prefs.periodo || 'hoje';
  const domingo = addDays(t0, (7 - dowOf(t0)) % 7);
  const presets = {
    hoje: [t0, t0], amanha: [addDays(t0, 1), addDays(t0, 1)], semana: [t0, domingo],
    '7dias': [t0, addDays(t0, 6)], evento: [t0, e.data && e.data >= t0 ? e.data : addDays(t0, 6)],
  };
  if (presets[p]) return { p, de: presets[p][0], ate: presets[p][1] };
  let de = normDate(prefs.de) || t0, ate = normDate(prefs.ate) || de; if (ate < de) [de, ate] = [ate, de];
  return { p: 'custom', de, ate };
}

function avisosDoEvento() {
  const e = ev(), t0 = today(), r = reservas(), avisos = [];
  if (e.prazo_pagamento) {
    const dp = diffDays(e.prazo_pagamento, t0);
    if (dp >= 0 && dp <= 3 && r.lista.length) avisos.push([`Prazo de pagamento ${dp === 0 ? 'é hoje' : `em ${dp} dia(s)`}: ${r.lista.length} na lista sem pagar`, 'reservas']);
    if (dp < 0 && r.lista.length) avisos.push([`O prazo passou e ${r.lista.length} da lista não pagaram. Libere as vagas para a espera (${r.espera.length}).`, 'reservas', 1]);
    if (dp < 0 && !r.lista.length && r.vagas && r.espera.length) avisos.push([`${r.vagas} vaga(s) aberta(s) e ${r.espera.length} na espera`, 'reservas']);
  }
  if (r.pagos.length > r.cap && r.cap) avisos.push([`Mais pagos (${r.pagos.length}) que lugares (${r.cap})`, 'reservas', 1]);
  const abertos = of('Cardapio').filter(c => ['Candidato', 'Em teste'].includes(c.status));
  if (abertos.length) avisos.push([`${abertos.length} prato(s) ainda sem decisão`, 'cardapio']);
  const incompletas = of('Cardapio').filter(c => c.status === 'Aprovado').map(c => receita(c.receita_id)).filter(x => x && receitaIncompleta(x).length);
  if (incompletas.length) avisos.push([`Receita incompleta: ${incompletas.map(x => x.nome).join(', ')}`, 'receitas']);
  const semPreco = of('Bebidas').filter(b => num(b.preco_taca) == null && num(b.preco_garrafa) == null && !/welcome|cortesia/i.test(b.observacao)).length;
  if (semPreco) avisos.push([`${semPreco} bebida(s) sem preço`, 'bebidas']);
  if (e.data && diffDays(e.data, t0) <= 3 && diffDays(e.data, t0) >= 0) {
    const pend = of('Compras').filter(c => c.status === 'Comprar').length;
    if (pend) avisos.push([`${pend} item(ns) de compra pendente(s)`, 'compras']);
  }
  return avisos;
}

function hoje() {
  const e = ev(), t0 = today(), ts = tasks(), r = reservas(), per = periodo();
  const noPeriodo = ts.filter(t => t.data && t.data >= per.de && t.data <= per.ate && !(prefs.ocultarFeitas && isDone(t)));
  const pendPeriodo = noPeriodo.filter(t => !isDone(t)).length;
  const late = ts.filter(t => t.data && t.data < t0 && !isDone(t));
  const done = ts.filter(isDone).length, pct = ts.length ? Math.round(done / ts.length * 100) : 0;
  const avisos = avisosDoEvento();
  const dP = e.prazo_pagamento ? diffDays(e.prazo_pagamento, t0) : null;
  const dias = new Map(); noPeriodo.forEach(t => { if (!dias.has(t.data)) dias.set(t.data, []); dias.get(t.data).push(t); });
  const titulo = per.de === per.ate ? (per.de === t0 ? 'Hoje' : per.de === addDays(t0, 1) ? 'Amanhã' : fmtLong(per.de)) : `${fmtLong(per.de)} a ${fmtLong(per.ate)}`;
  const chip = (k, l) => `<button class="${per.p === k ? 'active' : ''}" data-periodo="${k}">${l}</button>`;
  const lista = [...dias].map(([d, l]) => `${per.de !== per.ate ? `<div class="group-h">${esc(fmtLong(d))}${d === t0 ? ' · hoje' : ''}</div>` : ''}${l.map(t => taskHTML(t)).join('')}`).join('');
  $('#main').innerHTML = `
    <div class="summary">
      <div class="stat"><span class="stat-n">${pct}%</span><span class="stat-l">das tarefas feitas</span><div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="stat"><span class="stat-n">${r.pagos.length}<small>/${r.cap || '?'}</small></span><span class="stat-l">pagos · ${r.lista.length} na lista, ${r.espera.length} na espera</span></div>
      <div class="stat ${late.length ? 'bad' : ''}"><span class="stat-n">${late.length}</span><span class="stat-l">tarefa${late.length === 1 ? '' : 's'} atrasada${late.length === 1 ? '' : 's'}</span></div>
      <div class="stat"><span class="stat-n stat-date">${e.prazo_pagamento ? esc(fmt(e.prazo_pagamento)) : '—'}</span><span class="stat-l">prazo de pagamento${dP == null ? '' : dP > 0 ? ` · em ${dP} dia${dP > 1 ? 's' : ''}` : dP === 0 ? ' · hoje' : ' · encerrado'}</span></div>
    </div>
    ${avisos.length ? `<div class="alerts">${avisos.map(([m, p, bad]) => `<button class="alert ${bad ? 'bad' : ''}" data-nav="${p}"><span>${esc(m)}</span><span class="go">Abrir</span></button>`).join('')}</div>` : ''}
    <div class="layout-2">
      ${section(`${esc(titulo)} <span class="count-sub">${pendPeriodo} pendente${pendPeriodo === 1 ? '' : 's'}</span>`,
        `<div class="seg" role="group" aria-label="Período">${chip('hoje', 'Hoje')}${chip('amanha', 'Amanhã')}${chip('semana', 'Esta semana')}${chip('7dias', '7 dias')}${e.data && e.data >= t0 ? chip('evento', 'Até o evento') : ''}</div>
        <details class="more" ${per.p === 'custom' ? 'open' : ''}><summary>Outro período</summary><div class="inline-fields">
          <label class="f">De<input type="date" id="per-de" value="${per.de}"></label><label class="f">Até<input type="date" id="per-ate" value="${per.ate}"></label>
          <label class="chk"><input type="checkbox" id="ocultar" ${prefs.ocultarFeitas ? 'checked' : ''}> Ocultar feitas</label></div></details>
        ${lista || emptyMsg('Nenhuma tarefa nesse período.')}`)}
      ${section(`Atrasadas <span class="count-sub">${late.length}</span>`, late.map(t => taskHTML(t, { date: 1 })).join('') || emptyMsg('Tudo em dia.'))}
    </div>
    ${MODE === 'n8n' ? '<p class="foot-act"><button class="linkbtn" data-act="resumo">Mandar o resumo por e-mail agora</button></p>' : ''}`;
}

function tarefas() {
  const all = tasks(), t0 = today();
  const shown = all.filter(t => !(prefs.ocultarFeitas && isDone(t)));
  const groups = new Map();
  if (prefs.tarefasPor === 'fase') {
    [...L.fases, ...new Set(shown.map(t => t.fase).filter(f => !L.fases.includes(f)))].forEach(f => groups.set(f, []));
    shown.forEach(t => { if (!groups.has(t.fase || 'Sem fase')) groups.set(t.fase || 'Sem fase', []); groups.get(t.fase || 'Sem fase').push(t); });
  } else shown.forEach(t => { const k = t.data || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const label = k => prefs.tarefasPor === 'fase' ? esc(k) : k ? esc(fmtLong(k)) + (k === t0 ? ' · hoje' : '') : 'Sem data';
  $('#main').innerHTML = head('Tarefas', `${all.filter(isDone).length} de ${all.length} feitas. Toque numa tarefa para editar.`,
      '<button class="btn" data-act="nova-tarefa">Nova tarefa</button>') + `
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Agrupar"><button class="${prefs.tarefasPor === 'data' ? 'active' : ''}" data-pref="tarefasPor" data-val="data">Por data</button><button class="${prefs.tarefasPor === 'fase' ? 'active' : ''}" data-pref="tarefasPor" data-val="fase">Por fase</button></div>
      <label class="chk"><input type="checkbox" id="ocultar" ${prefs.ocultarFeitas ? 'checked' : ''}> Ocultar feitas</label>
    </div>
    ${section('', [...groups].filter(([, l]) => l.length).map(([k, l]) => `<div class="group-h ${prefs.tarefasPor === 'data' && k && k < t0 && l.some(t => !isDone(t)) ? 'late' : ''}">${label(k)}</div>
      ${l.map(t => taskHTML(t, { date: prefs.tarefasPor === 'fase' })).join('')}`).join('') || emptyMsg('Nenhuma tarefa.'))}
    <div class="hint"><p>O plano de produção cria uma tarefa para cada passo das receitas aprovadas no Cardápio. Rodar de novo atualiza sem duplicar.</p><button class="btn ghost small" data-act="gerar-producao">Gerar plano de produção</button></div>`;
}

function telaReservas() {
  const e = ev(), r = reservas(), t0 = today(), dP = e.prazo_pagamento ? diffDays(e.prazo_pagamento, t0) : null;
  const nomes = DB.Pessoas.filter(live).map(p => p.nome);
  const sugerido = r.pagos.length + r.lista.length >= r.cap && r.cap ? 'Espera' : 'Lista';
  const linha = (x, i) => { const p = pessoa(x.pessoa_id);
    const contato = [p.telefone, p.instagram].filter(Boolean).join(' · ');
    const end = x.status === 'Pago' ? `<span class="money">${money(valorReserva(x))}</span>`
      : x.status !== 'Desistiu' ? `<button class="btn small ghost" data-pagou="${esc(x.id)}">Marcar pago</button>` : '';
    return item({ open: `Reservas|${x.id}`, cls: x.status === 'Desistiu' ? 'off' : '',
      title: `${i != null ? `<span class="pos">${i + 1}</span>` : ''}${esc(p.nome)}`,
      sub: [contato && esc(contato), p.restricao && `<span class="warn-txt">${esc(p.restricao)}</span>`, x.status === 'Pago' && x.pagamento ? `pagou ${esc(fmt(x.pagamento))}` : x.entrada ? `entrou ${esc(fmt(x.entrada))}` : ''].filter(Boolean).join(' · '),
      end }); };
  const bloco = (titulo, list, numbered, vazio) => section(`${titulo} <span class="count-sub">${list.length}</span>`, list.map((x, i) => linha(x, numbered ? i : null)).join('') || emptyMsg(vazio));
  let aviso = '';
  if (dP != null && dP < 0 && r.lista.length) aviso = `<div class="notice bad"><b>O prazo de pagamento passou.</b> ${r.lista.length} pessoa(s) da lista não pagaram. Avise que a vaga foi liberada (status <i>Desistiu</i>) e chame a espera: quem pagar primeiro fica.</div>`;
  else if (dP != null && dP < 0 && r.vagas && r.espera.length) aviso = `<div class="notice warn">${r.vagas} vaga(s) aberta(s). A espera já pode pagar: quem pagar primeiro fica.</div>`;
  else if (dP != null && dP >= 0) aviso = `<div class="notice">Prazo de pagamento: <b>${esc(fmtLong(e.prazo_pagamento))}</b>${dP ? ` (em ${dP} dia${dP > 1 ? 's' : ''})` : ' (hoje)'}. Quem chega com a lista cheia vai para a espera.</div>`;
  $('#main').innerHTML = head('Reservas', `Ingresso ${num(e.valor_ingresso) != null ? money(num(e.valor_ingresso)) : 'sem valor definido'} · recebido ${money(r.pagos.reduce((s, x) => s + valorReserva(x), 0))}`) + `
    <div class="figures"><div><b>${r.pagos.length}<small>/${r.cap || '?'}</small></b><span>pagos</span></div><div><b>${r.vagas}</b><span>vagas</span></div><div><b>${r.lista.length}</b><span>na lista</span></div><div><b>${r.espera.length}</b><span>na espera</span></div></div>
    ${aviso}
    <form id="f-reserva" class="addbar" autocomplete="off">
      <label class="f grow">Nome<input name="nome" list="dl-pessoas" required placeholder="Quem já veio aparece na lista"></label>
      <label class="f">Telefone ou @<input name="contato" placeholder="Opcional"></label>
      <label class="f">Entra como<select name="status">${opts(L.reserva.slice(0, 3), sugerido)}</select></label>
      <button class="btn">Adicionar</button>
    </form>${datalist('dl-pessoas', nomes)}
    ${bloco('Pagos', r.pagos, false, 'Ninguém pagou ainda.')}
    ${bloco('Na lista, falta pagar', r.lista, false, 'Ninguém na lista.')}
    ${bloco('Espera', r.espera, true, 'Ninguém na espera.')}
    ${r.desist.length ? `<details class="more sheet-like"><summary>Desistiram (${r.desist.length})</summary>${r.desist.map(x => linha(x)).join('')}</details>` : ''}`;
}

function cardapio() {
  const base = basePessoas();
  const recs = DB.Receitas.filter(live).sort((a, b) => a.nome.localeCompare(b.nome));
  const cs = of('Cardapio').sort((a, b) => (num(a.ordem) ?? 99) - (num(b.ordem) ?? 99) || (receita(a.receita_id)?.nome || '').localeCompare(receita(b.receita_id)?.nome || ''));
  $('#main').innerHTML = head('Cardápio', `Pratos na ordem de serviço, para ${base.n} pessoas. Só os aprovados entram nas compras e no plano de produção.`) + `
    <form id="f-prato" class="addbar" autocomplete="off">
      <label class="f grow">Prato (do livro de receitas ou novo)<input name="nome" list="dl-receitas" required></label>
      <label class="f narrow">Ordem<input name="ordem" inputmode="numeric" value="${(Math.max(0, ...cs.map(c => num(c.ordem) || 0)) || 0) + 1}"></label>
      <button class="btn">Adicionar</button>
    </form>${datalist('dl-receitas', recs.map(r => r.nome))}
    ${section('', cs.map(c => { const r = receita(c.receita_id), falta = r ? receitaIncompleta(r) : ['receita'], pp = num(c.porcoes_pessoa), b = byId('Bebidas', c.bebida_id);
      return item({ open: `Cardapio|${c.id}`, cls: c.status === 'Descartado' ? 'off' : '',
        lead: `<span class="ord">${esc(c.ordem || '·')}</span>`,
        title: esc(r?.nome || '(receita removida)'),
        sub: [pp ? `${fmtNum(pp * base.n, 1)} porções` : 'sem porções', b && `com ${esc(b.rotulo)}`, falta.length && `<span class="warn-txt">falta ${esc(falta.join(', '))}</span>`].filter(Boolean).join(' · '),
        end: pill(c.status || 'Candidato', PILL[c.status]) }); }).join('') || emptyMsg('Nenhum prato ainda. Adicione o primeiro acima.'))}
    <div class="hint"><p>As porções usam a base de ${base.n} pessoas (${esc(base.label)}). Dá para mudar em Compras.</p><button class="btn ghost small" data-act="gerar-producao">Gerar plano de produção</button></div>`;
}

function telaReceitas() {
  const q = (prefs.busca || '').toLowerCase();
  const recs = DB.Receitas.filter(live).sort((a, b) => a.nome.localeCompare(b.nome));
  if (!recSel || !receita(recSel) || !live(receita(recSel))) recSel = (of('Cardapio').map(c => c.receita_id).find(id => receita(id)) || recs[0]?.id) || null;
  const noEvento = new Set(of('Cardapio').map(c => c.receita_id));
  const r = recSel ? receita(recSel) : null;
  let editor = emptyMsg('Nenhuma receita. Crie a primeira.');
  if (r) {
    const itens = itensDe(r.id), passos = passosDe(r.id), falta = receitaIncompleta(r);
    const usos = DB.Cardapio.filter(c => live(c) && c.receita_id === r.id).map(c => byId('Eventos', c.evento_id)?.nome).filter(Boolean);
    editor = `
      <section class="sheet">
        <div class="sheet-h"><div><h3>${esc(r.nome)}</h3><p class="mini">${falta.length ? `<span class="warn-txt">Falta: ${esc(falta.join(', '))}</span>` : 'Receita completa'}${usos.length ? ` · usada em ${esc([...new Set(usos)].join(', '))}` : ''}</p></div>
          <button class="btn small danger" data-del="Receitas|${esc(r.id)}">Excluir</button></div>
        <div class="row">
          ${field('Receitas', r, { f: 'nome', l: 'Nome', w: 5, wide: 1 })}
          ${field('Receitas', r, { f: 'categoria', l: 'Categoria', list: 'dl-cat', w: 3 })}
          ${field('Receitas', r, { f: 'rende', l: 'Rende (porções)', t: 'num', w: 2 })}
          ${field('Receitas', r, { f: 'status', l: 'Status', t: 'select', o: L.receita, w: 2 })}
          ${field('Receitas', r, { f: 'preparo', l: 'Modo de preparo', t: 'textarea', w: 12, wide: 1 })}
          ${field('Receitas', r, { f: 'observacoes', l: 'Observações', t: 'textarea', w: 12, wide: 1 })}
        </div>
      </section>
      <section class="sheet">
        <div class="sheet-h"><h3>Ingredientes</h3><span class="mini">quantidade para o rendimento; vazio = a gosto</span></div>
        ${itens.map(i => { const g = ingrediente(i.ingrediente_id) || { id: '', nome: '?' };
          return row(`<label class="f" style="--w:4">Ingrediente<input data-item-ing="${esc(i.id)}" list="dl-ing" value="${esc(g.nome)}"></label>
            ${field('Receita_Itens', i, { f: 'quantidade', l: 'Qtd', t: 'num', w: 1, ph: 'a gosto' })}
            ${g.id ? field('Ingredientes', g, { f: 'unidade', l: 'Unidade', t: 'select', o: L.unidades, blank: '—', w: 2 }) : cell('', 2)}
            ${field('Receita_Itens', i, { f: 'observacao', l: 'Obs.', w: 3, ph: 'ex.: só a gema' })}
            ${cell(g.id ? `<button class="linkbtn" data-open="Ingredientes|${esc(g.id)}">Compra</button>` : '', 1)}
            ${xbtn('Receita_Itens', i.id, 'ingrediente')}`, 'compact'); }).join('') || emptyMsg('Nenhum ingrediente ainda.')}
        <form id="f-item" class="addbar inset" autocomplete="off">
          <label class="f grow">Ingrediente<input name="nome" list="dl-ing" required></label>
          <label class="f narrow">Qtd<input name="qtd" inputmode="decimal" placeholder="a gosto"></label>
          <label class="f">Unidade (se novo)<select name="unidade">${opts(L.unidades, 'colher')}</select></label>
          <button class="btn">Adicionar</button>
        </form>
      </section>
      <section class="sheet">
        <div class="sheet-h"><h3>Passos</h3><span class="mini">viram tarefas no plano de produção</span></div>
        ${passos.map(p => row(`${field('Receita_Passos', p, { f: 'ordem', l: 'Nº', t: 'num', w: 1 })}
          ${field('Receita_Passos', p, { f: 'passo', l: 'Passo', w: 6, wide: 1 })}
          ${field('Receita_Passos', p, { f: 'quando', l: 'Quando', t: 'select', o: [['dias', 'dias antes'], ['horas', 'horas antes do início']] })}
          ${field('Receita_Passos', p, { f: 'antes', l: p.quando === 'dias' ? 'Dias antes' : 'Horas antes', t: 'num', w: 2 })}
          ${xbtn('Receita_Passos', p.id, 'passo')}
          ${cell(`<small>${esc(quandoTxt(p))}</small>`, 2)}
          ${field('Receita_Passos', p, { f: 'duracao_min', l: 'Duração (min)', t: 'num', w: 2 })}
          ${field('Receita_Passos', p, { f: 'equipamento', l: 'Equipamento', list: 'dl-equip', w: 3 })}
          ${field('Receita_Passos', p, { f: 'conservacao', l: 'Como guardar', w: 5, wide: 1 })}`, 'compact')).join('') || emptyMsg('Nenhum passo ainda.')}
        <div class="inset"><button class="btn small ghost" data-act="novo-passo">Adicionar passo</button></div>
      </section>`;
  }
  $('#main').innerHTML = head('Receitas', 'O livro de receitas do Gato Véio. Fica guardado de um evento para o outro.', '<button class="btn" data-act="nova-receita">Nova receita</button>') + `
    <div class="split">
      <aside class="sheet side">
        <input id="busca" type="search" placeholder="Buscar receita" value="${esc(prefs.busca)}">
        <div class="reclist">${recs.filter(x => !q || x.nome.toLowerCase().includes(q)).map(x => `<button class="${x.id === recSel ? 'active' : ''}" data-pick-rec="${esc(x.id)}">${esc(x.nome)}<small>${esc(x.categoria || 'sem categoria')}${noEvento.has(x.id) ? ' · neste evento' : ''}${receitaIncompleta(x).length ? ' · incompleta' : ''}</small></button>`).join('')}</div>
      </aside>
      <div>${editor}</div>
    </div>
    ${datalist('dl-ing', DB.Ingredientes.filter(live).map(g => g.nome).sort())}`;
}
function compraResumo(g) {
  const fc = num(g.compra_fator);
  const conv = g.compra_unidade && fc ? `1 ${g.unidade || 'un'} = ${fmtNum(fc, 3)} ${g.compra_unidade}` : g.unidade === 'a gosto' ? 'a gosto' : 'sem conversão';
  return `${conv} · ${g.onde_comprar || 'onde?'}`;
}
function quandoTxt(p) {
  const e = ev(), a = num(p.antes) || 0;
  if (!e.data) return '';
  if (p.quando === 'dias') return a === 0 ? 'no dia do evento' : fmtLong(addDays(e.data, -Math.round(a)));
  return `no dia, às ${hhmm(Math.max((minutes(e.hora) ?? 1140) - a * 60, 0))}`;
}

function compras() {
  const base = basePessoas(), all = of('Compras'), filtro = prefs.compras || 'pendentes';
  const cs = filtro === 'pendentes' ? all.filter(c => c.status === 'Comprar') : all;
  const ordem = ['Açougue', 'Feira', 'Mercado', 'Empório', 'Atacado', 'Padaria', 'Vinícola', 'Outro'];
  const grupos = new Map(); [...ordem, ...new Set(cs.map(c => c.onde_comprar || 'Outro'))].forEach(o => grupos.set(o, []));
  cs.slice().sort((a, b) => (a.status === 'Comprar' ? 0 : 1) - (b.status === 'Comprar' ? 0 : 1) || a.item.localeCompare(b.item)).forEach(c => grupos.get(c.onde_comprar || 'Outro').push(c));
  const pend = all.filter(c => c.status === 'Comprar').length, total = all.reduce((s, c) => s + (num(c.custo) || 0), 0);
  const { skipped } = shoppingNeeds(base.n || 1);
  const linha = c => { const comprado = c.status !== 'Comprar';
    const qtd = [c.quantidade, c.unidade].filter(Boolean).join(' ');
    return item({ open: `Compras|${c.id}`, cls: comprado ? 'done' : '',
      lead: `<button class="check ${comprado ? 'on' : ''}" data-tog-compra="${esc(c.id)}" aria-label="${comprado ? 'Voltar para comprar' : 'Marcar comprado'}">${comprado ? '✓' : ''}</button>`,
      title: esc(c.item) + (c.status === 'Já tenho' ? ' <span class="pill ok">já tenho</span>' : ''),
      sub: esc(c.observacao || ''),
      end: `${qtd ? `<span class="qty">${esc(qtd)}</span>` : ''}${num(c.custo) ? `<span class="money">${money(num(c.custo))}</span>` : ''}` }); };
  $('#main').innerHTML = head('Compras', `${pend} pendente${pend === 1 ? '' : 's'} de ${all.length} · gasto ${money(total)}`,
      `<button class="btn ghost" data-copiar="">Copiar pendentes</button>`) + `
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Mostrar"><button class="${filtro === 'pendentes' ? 'active' : ''}" data-pref="compras" data-val="pendentes">Pendentes</button><button class="${filtro === 'todos' ? 'active' : ''}" data-pref="compras" data-val="todos">Todos</button></div>
    </div>
    ${[...grupos].filter(([, l]) => l.length).map(([g, l]) => section(`${esc(g)} <span class="count-sub">${l.filter(c => c.status === 'Comprar').length} pendente${l.filter(c => c.status === 'Comprar').length === 1 ? '' : 's'}</span>`,
        l.map(linha).join(''), l.some(c => c.status === 'Comprar') ? `<button class="linkbtn" data-copiar="${esc(g)}">Copiar</button>` : '')).join('')
      || section('', emptyMsg(filtro === 'pendentes' ? 'Nada pendente. Tudo comprado.' : 'Lista vazia. Gere a partir das receitas ou adicione itens avulsos.'))}
    <form id="f-compra" class="addbar" autocomplete="off">
      <label class="f grow">Item avulso<input name="item" required placeholder="Gelo, carvão, guardanapo…"></label>
      <label class="f narrow">Qtd<input name="qtd"></label>
      <label class="f">Onde<input name="onde" list="dl-onde" value="Mercado"></label>
      <button class="btn">Adicionar</button>
    </form>
    <details class="more sheet-like"><summary>Gerar a lista pelas receitas</summary>
      <div class="inline-fields">
        <label class="f">Calcular para<select id="base">${opts([['auto', 'Automático'], ['pagos', `Pagos (${reservas().pagos.length})`], ['capacidade', `Capacidade (${reservas().cap})`], ['outro', 'Outro número']], prefs.base)}</select></label>
        ${prefs.base === 'outro' ? `<label class="f narrow">Pessoas<input id="baseN" inputmode="numeric" value="${esc(prefs.baseN)}"></label>` : ''}
        <button class="btn" data-act="gerar-compras">Gerar ou atualizar (${base.n} pessoas)</button>
      </div>
      <p class="mini">Base atual: ${base.n} pessoas (${esc(base.label)}). Atualizar recalcula as quantidades e mantém o que já foi marcado como comprado ou já tenho.${skipped.length ? `<br><b>Fora da conta</b> (aprovados sem receita completa): ${esc(skipped.join(', '))}.` : ''}</p>
    </details>`;
}

function bebidas() {
  const bs = of('Bebidas');
  const acerto = new Map();
  bs.forEach(b => { const c = bebidaCalc(b), k = byId('Fornecedores', b.fornecedor_id)?.nome || 'Sem fornecedor', a = acerto.get(k) || { consumidas: 0, pagar: 0, devolver: 0, pendente: 0 };
    a.consumidas += c.consumidas || 0; a.pagar += c.pagar || 0; a.pendente += c.pendente; if (b.modalidade !== 'Comprado') a.devolver += num(b.devolvidas) || 0; acerto.set(k, a); });
  const tot = k => [...acerto.values()].reduce((s, a) => s + a[k], 0);
  $('#main').innerHTML = head('Bebidas', `Taça de 150 ml, ${TACAS} por garrafa. Toque num rótulo para editar preços e quantidades.`, '<button class="btn" data-act="nova-bebida">Nova bebida</button>') + `
    ${section('', bs.map(b => { const c = bebidaCalc(b), f = byId('Fornecedores', b.fornecedor_id)?.nome;
      const status = c.aguardando ? `<span class="pill wait">aguardando devolução</span>` : c.consumidas != null ? `<span class="qty">${c.consumidas} consumida${c.consumidas === 1 ? '' : 's'}</span><span class="money">${money(c.pagar)}</span>` : '<span class="qty">sem quantidade</span>';
      const precos = [num(b.preco_taca) != null && `taça ${money(num(b.preco_taca))}`, num(b.preco_garrafa) != null && `garrafa ${money(num(b.preco_garrafa))}`, c.custo != null && `custo ${money(c.custo)}`].filter(Boolean).join(' · ');
      return item({ open: `Bebidas|${b.id}`, title: esc(b.rotulo),
        sub: [esc([b.tipo, f, b.modalidade].filter(Boolean).join(' · ')), precos, num(b.recebidas) != null ? `${fmtNum(num(b.recebidas))} recebidas${num(b.devolvidas) != null ? `, ${fmtNum(num(b.devolvidas))} devolvidas` : ''}` : ''].filter(Boolean).join('<br>'),
        end: status }); }).join('') || emptyMsg('Nenhuma bebida ainda.'))}
    ${section('Acerto com fornecedores', `<p class="mini">No dia seguinte, preencha as garrafas devolvidas (fechadas) de cada rótulo. Vinho consignado só vira custo depois disso. Se não voltou nenhuma, coloque 0.</p>
      <div class="scroll"><table class="t"><thead><tr><th>Fornecedor</th><th class="n">Consumidas</th><th class="n">Devolver</th><th class="n">A pagar</th><th class="n">Aguardando</th></tr></thead><tbody>
      ${[...acerto].map(([k, a]) => `<tr><td>${esc(k)}</td><td class="n">${a.consumidas}</td><td class="n">${a.devolver}</td><td class="n">${money(a.pagar)}</td><td class="n">${a.pendente ? 'até ' + money(a.pendente) : '—'}</td></tr>`).join('')}
      <tr class="sum"><td>Total</td><td class="n">${tot('consumidas')}</td><td class="n">${tot('devolver')}</td><td class="n">${money(tot('pagar'))}</td><td class="n">${tot('pendente') ? 'até ' + money(tot('pendente')) : '—'}</td></tr></tbody></table></div>`)}`;
}

function telaEvento() {
  const e = ev(), list = events(), sug = sugestaoNovoEvento();
  const fc = evId ? fechamento() : null;
  const dl = (k, v) => `<div><dt>${k}</dt><dd>${v || '—'}</dd></div>`;
  $('#main').innerHTML = head('Evento', 'Dados, custos extras e fechamento.', list.length > 1 ? `<label class="f">Trocar de evento<select id="ev-pick">${list.map(x => `<option value="${esc(x.id)}" ${x.id === evId ? 'selected' : ''}>${esc(fmt(x.data))}/${esc((x.data || '').slice(2, 4))} · ${esc(x.nome)}</option>`).join('')}</select></label>` : '') + `
    ${evId ? `<div class="layout-2">
      ${section('Dados do evento', `<dl class="facts">
          ${dl('Data', e.data ? `${esc(fmtLong(e.data))}/${e.data.slice(0, 4)} às ${esc(e.hora || '—')}` : '')}
          ${dl('Status', esc(e.status))}${dl('Tema', esc(e.tema))}${dl('Formato', esc(e.formato))}
          ${dl('Lugares', esc(e.capacidade))}${dl('Ingresso', num(e.valor_ingresso) != null ? money(num(e.valor_ingresso)) : '')}
          ${dl('Prazo de pagamento', e.prazo_pagamento ? esc(fmtLong(e.prazo_pagamento)) : '')}
        </dl>${e.notas ? `<p class="notes">${esc(e.notas)}</p>` : ''}`, `<button class="btn small ghost" data-open="Eventos|${esc(e.id)}">Editar</button>`)}
      ${section('Fechamento', `
        <label class="f">Total vendido em bebidas no dia (soma das comandas)<input data-e="Eventos|${esc(e.id)}|vendas_bebidas" inputmode="decimal" value="${esc(e.vendas_bebidas)}" placeholder="R$ 0,00"></label>
        <table class="t ledger"><tbody>
          <tr><td>Ingressos pagos</td><td class="n">${money(fc.ingressos)}</td></tr>
          <tr><td>Bebidas vendidas</td><td class="n">${money(fc.bebidasVendidas)}</td></tr>
          <tr><td>Compras</td><td class="n neg">− ${money(fc.compras)}</td></tr>
          <tr><td>Custos extras</td><td class="n neg">− ${money(fc.custos)}</td></tr>
          <tr><td>Acerto com vinícolas${fc.vinicolasPendente ? `<span class="mini block">consignado aguardando devolução: até ${money(fc.vinicolasPendente)}, fora do resultado</span>` : ''}</td><td class="n neg">− ${money(fc.vinicolas)}</td></tr>
          <tr class="sum"><td>Resultado</td><td class="n" style="color:${fc.resultado < 0 ? 'var(--red)' : 'var(--green)'}">${money(fc.resultado)}</td></tr>
        </tbody></table>`)}
      ${section(`Custos extras <span class="count-sub">${money(fc.custos)}</span>`, (of('Custos').map(c => item({ open: `Custos|${c.id}`, title: esc(c.descricao || 'Sem descrição'), sub: esc(c.categoria || ''),
          end: `<span class="money">${money(num(c.valor))}</span>${pill(c.pago === 'sim' ? 'pago' : 'a pagar', c.pago === 'sim' ? 'ok' : 'wait')}` })).join('') || emptyMsg('Nenhum custo extra.')), '<button class="btn small ghost" data-act="novo-custo">Adicionar custo</button>')}
      ${section('Conexão', MODE === 'n8n' ? `<p class="mini">Os dados ficam na planilha Google, via n8n. Vocês dois veem e alteram as mesmas informações.</p>
          <div class="btnrow"><button class="btn small ghost" data-act="recarregar">Buscar últimas alterações</button><button class="btn small ghost" data-act="exportar">Baixar cópia (.json)</button><button class="btn small ghost" data-act="sair">Sair</button></div>`
        : `<div class="notice warn">Modo de teste: dados de exemplo, salvos só neste navegador. Para usar de verdade, coloque o endereço do n8n no config.js.</div>
          <div class="btnrow"><button class="btn small ghost" data-act="exportar">Baixar cópia (.json)</button><button class="btn small danger" data-act="reset">Voltar aos dados iniciais</button></div>`)}
    </div>` : ''}
    <details class="more sheet-like" ${evId ? '' : 'open'}><summary>Criar novo evento</summary>
      <p class="mini">As tarefas vêm do modelo (Cadastros → Modelo de tarefas). Sugestão: último sábado do mês, pagamento até o dia 15. Prazos no fim de semana vão para a sexta anterior.</p>
      <form id="f-evento" class="form-grid">
        <label class="f wide">Nome<input name="nome" required placeholder="Gato Véio de novembro"></label>
        <label class="f">Tema (comida)<input name="tema"></label>
        <label class="f">Formato<input name="formato" list="dl-formato"></label>
        <label class="f">Data<input name="data" type="date" required value="${sug.data}"></label>
        <label class="f">Início<input name="hora" type="time" value="19:00"></label>
        <label class="f">Lugares<input name="capacidade" inputmode="numeric" value="24"></label>
        <label class="f">Ingresso R$<input name="valor" inputmode="decimal" value="${esc(e.valor_ingresso || '')}"></label>
        <label class="f">Prazo de pagamento<input name="prazo" type="date" value="${sug.prazo}"></label>
        <div class="wide"><button class="btn">Criar evento</button></div>
      </form>
    </details>`;
}

function cadastros() {
  const sub = prefs.cad, tabs = [['pessoas', 'Pessoas'], ['fornecedores', 'Fornecedores'], ['ingredientes', 'Ingredientes'], ['modelo', 'Modelo de tarefas']];
  let body = '', addAct = '', note = '';
  if (sub === 'pessoas') {
    const vezes = id => DB.Reservas.filter(r => live(r) && r.pessoa_id === id && r.status === 'Pago').length;
    body = DB.Pessoas.filter(live).sort((a, b) => a.nome.localeCompare(b.nome)).map(p => item({ open: `Pessoas|${p.id}`, title: esc(p.nome),
      sub: [esc([p.telefone, p.instagram].filter(Boolean).join(' · ') || 'sem contato'), p.restricao && `<span class="warn-txt">${esc(p.restricao)}</span>`].filter(Boolean).join(' · '),
      end: `<span class="qty">${vezes(p.id)} evento${vezes(p.id) === 1 ? '' : 's'}</span>` })).join('');
    addAct = 'nova-pessoa';
  } else if (sub === 'fornecedores') {
    body = DB.Fornecedores.filter(live).map(f => item({ open: `Fornecedores|${f.id}`, title: esc(f.nome), sub: esc([f.tipo, f.cidade, f.contato].filter(Boolean).join(' · ')), end: '' })).join('');
    addAct = 'novo-fornecedor';
  } else if (sub === 'ingredientes') {
    note = 'A conversão diz quanto comprar: “1 colher = 0,25 cebola”. Arredondar = comprar inteiro (cebola sim, carne não).';
    body = DB.Ingredientes.filter(live).sort((a, b) => a.nome.localeCompare(b.nome)).map(g => item({ open: `Ingredientes|${g.id}`, title: esc(g.nome), sub: esc(compraResumo(g)), end: '' })).join('');
    addAct = 'novo-ingrediente';
  } else {
    note = 'D = dias em relação ao evento (−30 = 30 dias antes) · P = dias em relação ao prazo de pagamento · H = horas em relação ao início, no dia. Vale para os próximos eventos.';
    const refTxt = m => `${m.ref === 'H' ? 'H' : m.ref === 'P' ? 'P' : 'D'} ${num(m.desloc) > 0 ? '+' : ''}${esc(m.desloc || '0')}`;
    body = DB.Modelo_Tarefas.filter(live).map(m => item({ open: `Modelo_Tarefas|${m.id}`, title: esc(m.tarefa), sub: esc(m.fase || 'sem fase'), end: `<span class="qty">${refTxt(m)}</span>` })).join('');
    addAct = 'novo-modelo';
  }
  $('#main').innerHTML = head('Cadastros', 'O que vale para todos os eventos.', `<button class="btn" data-act="${addAct}">Adicionar</button>`) + `
    <div class="toolbar"><div class="seg" role="group">${tabs.map(([k, l]) => `<button class="${sub === k ? 'active' : ''}" data-pref="cad" data-val="${k}">${l}</button>`).join('')}</div></div>
    ${note ? `<p class="mini lead">${note}</p>` : ''}
    ${section('', body || emptyMsg('Nada cadastrado ainda.'))}`;
}

/* ---------- diálogos ---------- */
function openDialog(html, onOk, onDel) {
  const dlg = $('#dlg'), f = $('#dlg-form');
  f.innerHTML = html + `<div class="dlg-actions">${onDel ? '<button type="button" class="btn small danger left" id="dlg-del">Excluir</button>' : ''}<button class="btn ghost" value="cancel" formnovalidate>Cancelar</button><button class="btn" value="ok">Salvar</button></div>`;
  dlg.returnValue = ''; dlg.showModal();
  f.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  if (onDel) $('#dlg-del').onclick = () => { if (confirm('Excluir?')) { dlg.close(); onDel(); render(); } };
  dlg.onclose = () => { if (dlg.returnValue === 'ok') { onOk(new FormData(f)); render(); } };
}
function inputFor(c, v) {
  const n = `name="${c.f}"`;
  if (c.t === 'select') return `<select ${n}>${opts(typeof c.o === 'function' ? c.o() : c.o, v, c.blank)}</select>`;
  if (c.t === 'textarea') return `<textarea ${n} placeholder="${esc(c.ph || '')}">${esc(v)}</textarea>`;
  return `<input ${n} type="${c.t === 'num' ? 'text' : c.t || 'text'}" ${c.t === 'num' ? 'inputmode="decimal"' : ''} value="${esc(v)}" ${c.list ? `list="${c.list}"` : ''} placeholder="${esc(c.ph || '')}" ${c.req ? 'required' : ''}>`;
}
// Formulários de edição: cada aba tem seus campos; o diálogo salva tudo de uma vez.
const FORMS = {
  Compras: { t: 'item de compra', f: [
    { f: 'item', l: 'Item', wide: 1, req: 1 }, { f: 'quantidade', l: 'Quantidade' }, { f: 'unidade', l: 'Unidade' },
    { f: 'status', l: 'Status', t: 'select', o: L.compra }, { f: 'custo', l: 'Custo R$', t: 'num' },
    { f: 'onde_comprar', l: 'Onde comprar', list: 'dl-onde' }, { f: 'observacao', l: 'Observação', t: 'textarea', wide: 1 }] },
  Cardapio: { t: 'prato', f: [
    { f: 'ordem', l: 'Ordem de serviço', t: 'num' }, { f: 'porcoes_pessoa', l: 'Porções por pessoa', t: 'num' },
    { f: 'status', l: 'Status', t: 'select', o: L.prato }, { f: 'bebida_id', l: 'Harmonização', t: 'select', o: () => of('Bebidas').map(b => [b.id, b.rotulo]), blank: '—' },
    { f: 'teste', l: 'Teste e anotações', t: 'textarea', wide: 1, ph: 'Data do teste, resultado, o que ajustar' }] },
  Bebidas: { t: 'bebida', f: [
    { f: 'rotulo', l: 'Rótulo', wide: 1, req: 1 }, { f: 'fornecedor_id', l: 'Fornecedor', t: 'select', o: () => DB.Fornecedores.filter(live).map(f => [f.id, f.nome]), blank: '—' },
    { f: 'tipo', l: 'Tipo', list: 'dl-btipo' }, { f: 'modalidade', l: 'Modalidade', t: 'select', o: L.modalidade },
    { f: 'custo_garrafa', l: 'Custo da garrafa R$', t: 'num' }, { f: 'preco_garrafa', l: 'Preço da garrafa R$', t: 'num' }, { f: 'preco_taca', l: 'Preço da taça R$', t: 'num' },
    { f: 'recebidas', l: 'Garrafas recebidas', t: 'num' }, { f: 'devolvidas', l: 'Garrafas devolvidas', t: 'num', ph: 'preencher no fim' },
    { f: 'observacao', l: 'Observação', t: 'textarea', wide: 1 }] },
  Custos: { t: 'custo extra', f: [
    { f: 'descricao', l: 'Descrição', wide: 1, req: 1 }, { f: 'categoria', l: 'Categoria', list: 'dl-ccat' },
    { f: 'valor', l: 'Valor R$', t: 'num' }, { f: 'pago', l: 'Já foi pago?', t: 'select', o: [['não', 'Não'], ['sim', 'Sim']] }] },
  Eventos: { t: 'evento', f: [
    { f: 'nome', l: 'Nome', wide: 1, req: 1 }, { f: 'tema', l: 'Tema (comida)' }, { f: 'formato', l: 'Formato', list: 'dl-formato' },
    { f: 'data', l: 'Data', t: 'date' }, { f: 'hora', l: 'Início', t: 'time' }, { f: 'capacidade', l: 'Lugares', t: 'num' },
    { f: 'valor_ingresso', l: 'Ingresso R$', t: 'num' }, { f: 'prazo_pagamento', l: 'Prazo de pagamento', t: 'date' },
    { f: 'status', l: 'Status', t: 'select', o: L.evento }, { f: 'notas', l: 'Notas e combinados', t: 'textarea', wide: 1 }] },
  Pessoas: { t: 'pessoa', f: [
    { f: 'nome', l: 'Nome', wide: 1, req: 1 }, { f: 'telefone', l: 'Telefone' }, { f: 'instagram', l: 'Instagram' },
    { f: 'restricao', l: 'Restrição alimentar', wide: 1 }, { f: 'observacoes', l: 'Observações', t: 'textarea', wide: 1 }] },
  Fornecedores: { t: 'fornecedor', f: [
    { f: 'nome', l: 'Nome', wide: 1, req: 1 }, { f: 'tipo', l: 'Tipo', list: 'dl-ftipo' }, { f: 'cidade', l: 'Cidade' },
    { f: 'contato', l: 'Contato', wide: 1 }, { f: 'observacoes', l: 'Observações', t: 'textarea', wide: 1 }] },
  Ingredientes: { t: 'ingrediente', hint: 'Ex.: cebola roxa na receita em colher; 1 cebola dá 4 colheres → 1 colher = 0,25 cebola.', f: [
    { f: 'nome', l: 'Nome', wide: 1, req: 1 }, { f: 'unidade', l: 'Unidade na receita', t: 'select', o: L.unidades, blank: '—' },
    { f: 'onde_comprar', l: 'Onde comprar', list: 'dl-onde' }, { f: 'compra_fator', l: '1 unidade da receita =', t: 'num', ph: '0,25' },
    { f: 'compra_unidade', l: '… desta unidade de compra', ph: 'cebola, maço, pote' }, { f: 'arredondar', l: 'Comprar inteiro?', t: 'select', o: [['não', 'Não'], ['sim', 'Sim, arredondar para cima']] }] },
  Modelo_Tarefas: { t: 'tarefa do modelo', f: [
    { f: 'tarefa', l: 'Tarefa', wide: 1, req: 1 }, { f: 'fase', l: 'Fase', list: 'dl-fases' },
    { f: 'ref', l: 'Referência', t: 'select', o: [['D', 'Dias em relação ao evento'], ['P', 'Dias em relação ao pagamento'], ['H', 'Horas no dia do evento']] },
    { f: 'desloc', l: 'Deslocamento', t: 'num', ph: '-7' }, { f: 'nota', l: 'Nota', t: 'textarea', wide: 1 }] },
};
function recordDialog(tab, rec, isNew) {
  const F = FORMS[tab];
  openDialog(`<h3>${isNew ? 'Novo' : 'Editar'} ${esc(F.t)}</h3>${F.hint ? `<p class="mini">${esc(F.hint)}</p>` : ''}
    <div class="form-grid">${F.f.map(c => `<label class="f ${c.wide ? 'wide' : ''}">${esc(c.l)}${inputFor(c, rec[c.f] ?? '')}</label>`).join('')}</div>`,
    d => {
      const patch = {};
      F.f.forEach(c => { let v = (d.get(c.f) ?? '').toString(); if (c.t !== 'textarea') v = v.trim();
        if (DATE_FIELDS.includes(c.f)) v = normDate(v); if (c.f === 'hora') v = normTime(v); patch[c.f] = v; });
      const req = F.f.find(c => c.req); if (req && !patch[req.f]) return toast('Preencha ' + req.l.toLowerCase());
      save(tab, [{ ...rec, ...patch }]);
    },
    isNew ? null : () => save(tab, [{ ...rec, excluido: 'sim' }]));
}
function reservaDialog(x) {
  const p = pessoa(x.pessoa_id);
  openDialog(`<h3>${esc(p.nome)}</h3>
    <div class="form-grid">
      <label class="f">Status<select name="status">${opts(L.reserva, x.status)}</select></label>
      <label class="f">Valor pago R$<input name="valor_pago" inputmode="decimal" value="${esc(x.valor_pago)}" placeholder="${esc(fmtNum(num(ev().valor_ingresso)))}"></label>
      <label class="f">Entrou na lista em<input name="entrada" type="date" value="${esc(x.entrada)}"></label>
      <label class="f">Pagou em<input name="pagamento" type="date" value="${esc(x.pagamento)}"></label>
      <label class="f">Telefone<input name="telefone" value="${esc(p.telefone || '')}"></label>
      <label class="f">Instagram<input name="instagram" value="${esc(p.instagram || '')}"></label>
      <label class="f wide">Restrição alimentar<input name="restricao" value="${esc(p.restricao || '')}"></label>
      <label class="f wide">Observação da reserva<textarea name="observacao">${esc(x.observacao)}</textarea></label>
    </div>`,
    d => {
      const status = d.get('status');
      save('Reservas', [{ ...x, status, valor_pago: d.get('valor_pago').trim(), entrada: normDate(d.get('entrada')),
        pagamento: normDate(d.get('pagamento')) || (status === 'Pago' ? today() : ''), observacao: d.get('observacao') }]);
      if (p.id) { const np = { ...p, telefone: d.get('telefone').trim(), instagram: d.get('instagram').trim(), restricao: d.get('restricao').trim() };
        if (['telefone', 'instagram', 'restricao'].some(k => (p[k] || '') !== np[k])) save('Pessoas', [np], true); }
    },
    () => save('Reservas', [{ ...x, excluido: 'sim' }]));
}
function taskDialog(t) {
  const isNew = !t;
  t = t || { id: `${evId}_t${uid('m')}`, evento_id: evId, fase: '', tarefa: '', data: '', hora: '', status: 'Em aberto', origem: 'Manual', nota: '', excluido: '' };
  openDialog(`<h3>${isNew ? 'Nova tarefa' : 'Editar tarefa'}</h3>
    <div class="form-grid">
      <label class="f wide">Tarefa<input name="tarefa" required value="${esc(t.tarefa)}"></label>
      <label class="f">Data<input name="data" type="date" value="${esc(t.data)}"></label>
      <label class="f">Horário<input name="hora" type="time" value="${esc(t.hora)}"></label>
      <label class="f">Fase<input name="fase" list="dl-fases" value="${esc(t.fase)}"></label>
      <label class="f">Status<select name="status">${opts(L.tarefa, t.status)}</select></label>
      <label class="f wide">Nota<textarea name="nota">${esc(t.nota)}</textarea></label>
    </div>
    ${t.origem === 'Produção' ? '<p class="mini">Tarefa do plano de produção: se o plano for gerado de novo, o texto e o horário voltam ao que está na receita.</p>' : ''}`,
    d => { const tarefa = d.get('tarefa').trim(); if (!tarefa) return;
      save('Tarefas', [{ ...t, tarefa, fase: d.get('fase').trim(), status: d.get('status'), data: normDate(d.get('data')), hora: normTime(d.get('hora')), nota: d.get('nota') }]); },
    isNew ? null : () => save('Tarefas', [{ ...t, excluido: 'sim' }]));
}
function openRecord(key) {
  const [tab, id] = key.split('|'), rec = byId(tab, id); if (!rec) return;
  if (tab === 'Reservas') return reservaDialog(rec);
  if (FORMS[tab]) return recordDialog(tab, rec);
}
const staticLists = () => [datalist('dl-onde', L.onde), datalist('dl-btipo', L.bebidaTipo), datalist('dl-ccat', L.custoCat), datalist('dl-ftipo', L.fornTipo),
  datalist('dl-fases', L.fases), datalist('dl-formato', L.formato), datalist('dl-cat', L.categorias), datalist('dl-equip', L.equip)].join('');

/* ---------- copiar lista para o app Lembretes ---------- */
function linhaCompra(c) {
  if (c.unidade === 'a gosto') return `${c.item} (conferir se tem)`;
  let u = c.unidade || '';
  const n = num(c.quantidade);
  if (n != null && n > 1 && /^[a-zà-ú]{3,}$/i.test(u) && !/s$/i.test(u) && /[aeiouáéíóú]$/i.test(u)) u += 's';
  const q = [c.quantidade, u].filter(Boolean).join(' ');
  return q ? `${c.item} – ${q}` : c.item;
}
async function copiarCompras(onde) {
  const pend = of('Compras').filter(c => c.status === 'Comprar' && (!onde || (c.onde_comprar || 'Outro') === onde))
    .sort((a, b) => (a.onde_comprar || '').localeCompare(b.onde_comprar || '') || a.item.localeCompare(b.item));
  if (!pend.length) return toast('Nada pendente para copiar');
  const texto = pend.map(linhaCompra).join('\n');
  let ok = false;
  try { await navigator.clipboard.writeText(texto); ok = true; } catch (e) {}
  if (!ok) {
    const ta = document.createElement('textarea'); ta.value = texto; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, texto.length);
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
  toast(ok ? `${pend.length} itens copiados. No Lembretes, toque num item novo e cole.` : 'Não consegui copiar neste navegador');
}

/* ---------- ações ---------- */
function findOrCreateIngredient(nome, unidade) {
  const n = nome.trim(); if (!n) return null;
  let g = DB.Ingredientes.find(x => live(x) && x.nome.toLowerCase() === n.toLowerCase());
  if (!g) { g = { id: uid('i'), nome: n, unidade: unidade || '', compra_unidade: '', compra_fator: '', arredondar: 'não', onde_comprar: 'Mercado', excluido: '' }; save('Ingredientes', [g], true); }
  return g;
}
function findOrCreatePessoa(nome, contato) {
  const n = nome.trim();
  let p = DB.Pessoas.find(x => live(x) && x.nome.toLowerCase() === n.toLowerCase());
  if (!p) { const c = (contato || '').trim(); p = { id: uid('p'), nome: n, telefone: c.startsWith('@') ? '' : c, instagram: c.startsWith('@') ? c : '', restricao: '', observacoes: '', excluido: '' }; save('Pessoas', [p], true); }
  else if (contato && !p.telefone && !p.instagram) save('Pessoas', [{ ...p, [contato.trim().startsWith('@') ? 'instagram' : 'telefone']: contato.trim() }], true);
  return p;
}
function setField(tab, id, f, value) {
  const rec = byId(tab, id); if (!rec) return;
  if (DATE_FIELDS.includes(f)) value = normDate(value);
  if (f === 'hora') value = normTime(value);
  if (String(rec[f]) === String(value)) return;
  const patch = { [f]: value };
  if (tab === 'Reservas' && f === 'status' && value === 'Pago' && !rec.pagamento) patch.pagamento = today();
  save(tab, [{ ...rec, ...patch }]);
}
function rerender() {
  setTimeout(() => {
    const a = document.activeElement, key = a?.dataset?.e || a?.dataset?.itemIng, y = window.scrollY;
    render(); window.scrollTo(0, y);
    if (key) { const el = document.querySelector(`[data-e="${CSS.escape(key)}"],[data-item-ing="${CSS.escape(key)}"]`); el?.focus(); }
  }, 0);
}
async function reload(quiet) {
  try { DB = await fetchDB(); if (!byId('Eventos', evId)) evId = pickEvent(); render(); if (!quiet) toast('Atualizado'); }
  catch (e) { if (e.auth) showLogin(); else if (!quiet) toast('Não consegui falar com o n8n'); }
}
const ACTIONS = {
  'nova-tarefa': () => taskDialog(null),
  'gerar-producao': gerarProducao,
  'gerar-compras': gerarCompras,
  'nova-receita': () => { const r = { id: uid('r'), nome: 'Nova receita', categoria: '', rende: '', status: 'Rascunho', preparo: '', observacoes: '', excluido: '' };
    save('Receitas', [r], true); recSel = r.id; page = 'receitas'; render(); const el = document.querySelector(`[data-e="Receitas|${r.id}|nome"]`); el?.focus(); el?.select(); },
  'novo-passo': () => { const ps = passosDe(recSel); save('Receita_Passos', [{ id: uid('rp'), receita_id: recSel, ordem: ps.length + 1, passo: '', quando: 'horas', antes: '', duracao_min: '', equipamento: '', conservacao: '', excluido: '' }], true); render();
    const last = passosDe(recSel).slice(-1)[0]; document.querySelector(`[data-e="Receita_Passos|${last.id}|passo"]`)?.focus(); },
  'nova-bebida': () => recordDialog('Bebidas', { id: uid(evId + '_b'), evento_id: evId, modalidade: 'Consignado', excluido: '' }, true),
  'novo-custo': () => recordDialog('Custos', { id: uid(evId + '_x'), evento_id: evId, pago: 'não', excluido: '' }, true),
  'nova-pessoa': () => recordDialog('Pessoas', { id: uid('p'), excluido: '' }, true),
  'novo-fornecedor': () => recordDialog('Fornecedores', { id: uid('f'), tipo: 'Vinícola', excluido: '' }, true),
  'novo-ingrediente': () => recordDialog('Ingredientes', { id: uid('i'), unidade: 'colher', arredondar: 'não', onde_comprar: 'Mercado', excluido: '' }, true),
  'novo-modelo': () => recordDialog('Modelo_Tarefas', { id: uid('m'), ref: 'D', desloc: '-7', excluido: '' }, true),
  'resumo': async b => { b.disabled = true; try { await api('resumo', { evento: evId }); toast('Resumo enviado para o e-mail'); } catch (e) { toast(e.auth ? 'Senha incorreta' : 'Não consegui falar com o n8n'); } b.disabled = false; },
  'recarregar': () => reload(),
  'sair': () => { localStorage.removeItem(K.senha); showLogin(); },
  'reset': () => { if (confirm('Apagar as alterações deste navegador e voltar aos dados iniciais?')) { localStorage.removeItem(K.local); reload(); } },
  'exportar': () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(DB, null, 1)], { type: 'application/json' })); a.download = `gato-veio-${today()}.json`; a.click(); },
};

document.addEventListener('click', e => {
  const t = e.target, d = s => t.closest(s);
  let el;
  if ((el = d('#tabs button, [data-nav]'))) { page = el.dataset.page || el.dataset.nav; render(); window.scrollTo({ top: 0 }); return; }
  if ((el = d('[data-done]'))) { const r = byId('Tarefas', el.dataset.done); save('Tarefas', [{ ...r, status: isDone(r) ? 'Em aberto' : 'Feito' }], true); render(); return; }
  if ((el = d('[data-tog-compra]'))) { const r = byId('Compras', el.dataset.togCompra); save('Compras', [{ ...r, status: r.status === 'Comprar' ? 'Comprado' : 'Comprar' }], true); render(); return; }
  if ((el = d('[data-edit-task]'))) return taskDialog(byId('Tarefas', el.dataset.editTask));
  if ((el = d('[data-del]'))) { const [tab, id] = el.dataset.del.split('|'), r = byId(tab, id);
    if (r && confirm('Remover?')) { save(tab, [{ ...r, excluido: 'sim' }]); render(); } return; }
  if ((el = d('[data-pagou]'))) { const r = byId('Reservas', el.dataset.pagou), rs = reservas();
    if (rs.cap && rs.pagos.length >= rs.cap && !confirm(`Já são ${rs.pagos.length} pagos para ${rs.cap} lugares. Confirmar mesmo assim?`)) return;
    save('Reservas', [{ ...r, status: 'Pago', pagamento: today(), valor_pago: r.valor_pago || ev().valor_ingresso || '' }]); render(); return; }
  if ((el = d('[data-pick-rec]'))) { recSel = el.dataset.pickRec; render(); return; }
  if ((el = d('[data-open-rec]'))) { recSel = el.dataset.openRec; page = 'receitas'; render(); window.scrollTo({ top: 0 }); return; }
  if ((el = d('[data-copiar]'))) { copiarCompras(el.dataset.copiar); return; }
  if ((el = d('[data-periodo]'))) { prefs.periodo = el.dataset.periodo; savePrefs(); render(); return; }
  if ((el = d('[data-pref]'))) { prefs[el.dataset.pref] = el.dataset.val; savePrefs(); render(); return; }
  if ((el = d('[data-act]')) && ACTIONS[el.dataset.act]) return ACTIONS[el.dataset.act](el);
  if ((el = d('[data-open]'))) return openRecord(el.dataset.open);
  if (d('#sync') && MODE === 'n8n') { queue.length ? flush() : reload(); }
});

document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open][role=button],[data-edit-task]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('change', e => {
  const x = e.target;
  if (x.dataset.e) {
    const [tab, id, f] = x.dataset.e.split('|'); setField(tab, id, f, x.value);
    if (!(x.tagName === 'TEXTAREA' || (x.tagName === 'INPUT' && x.type === 'text' && x.inputMode !== 'decimal' && !['nome', 'rotulo', 'item'].includes(f)))) rerender();
    return;
  }
  if (x.dataset.itemIng) { const it = byId('Receita_Itens', x.dataset.itemIng), g = findOrCreateIngredient(x.value);
    if (g && it.ingrediente_id !== g.id) save('Receita_Itens', [{ ...it, ingrediente_id: g.id }]); rerender(); return; }
  if (x.id === 'per-de' || x.id === 'per-ate') { const p = periodo(); prefs.de = x.id === 'per-de' ? x.value : p.de; prefs.ate = x.id === 'per-ate' ? x.value : p.ate;
    if (x.id === 'per-de' && normDate(prefs.ate) < normDate(prefs.de)) prefs.ate = prefs.de; prefs.periodo = 'custom'; savePrefs(); render(); return; }
  if (x.id === 'ocultar') { prefs.ocultarFeitas = x.checked; savePrefs(); render(); return; }
  if (x.id === 'base' || x.id === 'baseN') { prefs[x.id] = x.value; savePrefs(); render(); return; }
  if (x.id === 'ev-pick') { evId = x.value; store(K.ev, evId); render(); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'busca') { prefs.busca = e.target.value; savePrefs(); const pos = e.target.selectionStart; render(); const b = $('#busca'); b.focus(); b.setSelectionRange(pos, pos); }
});
document.addEventListener('submit', e => {
  const f = e.target, d = new FormData(f);
  const handlers = {
    'f-reserva': () => { const p = findOrCreatePessoa(d.get('nome'), d.get('contato'));
      if (of('Reservas').some(r => r.pessoa_id === p.id && r.status !== 'Desistiu')) return toast(`${p.nome} já está nas reservas`);
      save('Reservas', [{ id: uid(evId + '_r'), evento_id: evId, pessoa_id: p.id, status: d.get('status'), entrada: today(), pagamento: '', valor_pago: '', observacao: '', excluido: '' }]);
      render(); $('#f-reserva input[name=nome]')?.focus(); },
    'f-prato': () => { const nome = d.get('nome').trim(); let r = DB.Receitas.find(x => live(x) && x.nome.toLowerCase() === nome.toLowerCase());
      if (!r) { r = { id: uid('r'), nome, categoria: '', rende: '', status: 'Rascunho', preparo: '', observacoes: '', excluido: '' }; save('Receitas', [r], true); }
      save('Cardapio', [{ id: uid(evId + '_c'), evento_id: evId, receita_id: r.id, ordem: d.get('ordem'), porcoes_pessoa: '1', status: 'Candidato', teste: '', bebida_id: '', excluido: '' }]); render(); },
    'f-item': () => { const g = findOrCreateIngredient(d.get('nome'), d.get('unidade'));
      save('Receita_Itens', [{ id: uid('ri'), receita_id: recSel, ingrediente_id: g.id, quantidade: d.get('qtd').trim(), observacao: '', excluido: '' }]); render(); $('#f-item input[name=nome]')?.focus(); },
    'f-compra': () => { save('Compras', [{ id: uid(evId + '_a'), evento_id: evId, ingrediente_id: '', item: d.get('item').trim(), quantidade: d.get('qtd').trim(), unidade: '', onde_comprar: d.get('onde').trim() || 'Mercado', status: 'Comprar', custo: '', origem: 'Avulso', observacao: '', excluido: '' }]); render(); $('#f-compra input[name=item]')?.focus(); },
    'f-evento': () => criarEvento(d),
    'f-login': async () => { store(K.senha, d.get('senha')); $('#login-msg').textContent = 'Entrando…'; await start(); },
  };
  if (handlers[f.id]) { e.preventDefault(); handlers[f.id](); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && MODE === 'n8n' && DB && !queue.length && !document.querySelector('dialog[open]') && !document.activeElement?.matches('input,textarea,select')) reload(true);
});

function showLogin(msg) {
  $('#tabs').style.display = 'none';
  $('#main').innerHTML = `<div class="sheet login"><h2>Painel Gato Véio</h2><p class="muted">Entre com a senha combinada no n8n.</p>
    <form id="f-login"><input name="senha" type="password" required autocomplete="current-password" placeholder="Senha"><button class="btn" style="justify-content:center">Entrar</button></form>
    <p id="login-msg" class="mini" style="color:var(--red)">${esc(msg || '')}</p></div>`;
  $('#f-login input').focus();
}
async function start() {
  queue = MODE === 'n8n' ? load(K.queue, []) : [];
  if (MODE === 'n8n' && !load(K.senha, '')) return showLogin();
  try { DB = await fetchDB(); }
  catch (e) {
    if (e.auth) return showLogin(load(K.senha, '') ? 'Senha incorreta.' : '');
    const teste = API + '/gato-veio';
    $('#sync').className = 'sync err'; $('#sync').textContent = 'sem conexão';
    $('#main').innerHTML = MODE === 'n8n' ? `<div class="sheet"><h3>Não consegui falar com o n8n</h3>
      <p class="mini">Erro: ${esc(e.message)} · endereço usado: <b>${esc(teste)}</b></p>
      <ol style="padding-left:18px;line-height:1.7">
        <li>Abra <a href="${esc(teste)}" target="_blank" rel="noopener">este link</a> numa aba nova.
          <br>• “not registered for GET” → o endereço está certo; o problema é no workflow (passo 3).
          <br>• “not registered” / página de erro → workflow <b>inativo</b> ou endereço errado no <b>config.js</b>.</li>
        <li>O endereço no config.js precisa começar com <b>https://</b>, terminar em <b>/webhook</b> (sem /gato-veio no final) e não pode ser o <i>webhook-test</i>.</li>
        <li>No n8n, abra <b>Executions</b> do workflow: se aparece uma execução vermelha, clique nela e veja qual nó falhou (geralmente credencial do Google ou ID da planilha).</li>
      </ol>
      <div class="btnrow"><button class="btn" onclick="location.reload()">Tentar de novo</button><button class="btn ghost" onclick="localStorage.removeItem('${K.senha}');location.reload()">Trocar senha</button></div></div>`
      : `<div class="notice bad"><b>Não consegui carregar os dados.</b><br>Abra o painel por um servidor (GitHub Pages ou servidor local), não direto do arquivo.<br><span class="mini">${esc(e.message)}</span></div>`;
    if (MODE !== "n8n") setSync(); return;
  }
  $('#tabs').style.display = '';
  $('#lists').innerHTML = staticLists();
  evId = pickEvent(); render(); if (queue.length) flush();
}
start();
