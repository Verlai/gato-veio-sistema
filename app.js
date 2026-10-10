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
  const consumidas = rec != null ? (b.modalidade === 'Comprado' ? rec : rec - (dev || 0)) : null;
  return { custo, consumidas, pagar: custo != null && consumidas != null ? custo * consumidas : null,
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
  return { ingressos, bebidasVendidas, compras, custos, vinicolas, resultado: ingressos + bebidasVendidas - compras - custos - vinicolas };
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
const head = (title, sub, actions = '') => `<div class="head"><div><span class="overline">${esc((ev().nome || 'Gato Véio').toUpperCase())}</span><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
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

function taskHTML(t, o = {}) {
  const late = t.data && t.data < today() && !isDone(t);
  const pills = [];
  if (o.date) pills.push(`<span class="pill ${late ? 'late' : ''}">${esc(fmtLong(t.data))}${t.hora ? ' ' + esc(t.hora) : ''}</span>`);
  else if (t.hora) pills.push(`<span class="pill dark">${esc(t.hora)}</span>`);
  if (late && !o.date) pills.push('<span class="pill late">atrasada</span>');
  pills.push(`<span class="pill">${esc(t.fase || 'sem fase')}</span>`);
  return `<div class="task ${isDone(t) ? 'done' : ''}">
    <button class="check ${isDone(t) ? 'on' : ''}" data-done="${esc(t.id)}" aria-label="${isDone(t) ? 'Reabrir' : 'Concluir'}">${isDone(t) ? '✓' : ''}</button>
    <div class="task-body">
      <button class="task-title" data-edit-task="${esc(t.id)}">${esc(t.tarefa)}</button>
      <div class="meta">${pills.join('')}</div>
      ${t.nota ? `<p class="note-txt">${esc(t.nota)}</p>` : ''}
    </div>
    ${o.edit ? `<div class="when-edit"><input type="date" data-e="Tarefas|${esc(t.id)}|data" value="${esc(t.data)}" aria-label="Data"><input type="time" data-e="Tarefas|${esc(t.id)}|hora" value="${esc(t.hora)}" aria-label="Horário"></div>` : ''}
  </div>`;
}

/* ---------- telas ---------- */
function render() {
  const e = ev();
  $('#ev-name').textContent = e.nome || 'Gato Véio';
  if (e.data) {
    const d = diffDays(e.data, today()), r = reservas(), ts = tasks();
    $('#ev-when').innerHTML = `${esc(fmtLong(e.data))}/${e.data.slice(0, 4)} às ${esc(e.hora || '—')}${e.tema ? ` <span aria-hidden="true">✦</span> ${esc(e.tema)}` : ''}`;
    $('#stats').innerHTML = [d > 0 ? `faltam ${d} dia${d > 1 ? 's' : ''}` : d === 0 ? 'é hoje!' : `foi há ${-d} dia${d < -1 ? 's' : ''}`,
      `${r.pagos.length}/${r.cap || '?'} pagos`, `${ts.filter(isDone).length}/${ts.length} tarefas`].map(s => `<span>${s}</span>`).join('');
  } else { $('#ev-when').textContent = 'Nenhum evento ainda: crie o primeiro na aba Evento'; $('#stats').innerHTML = ''; }
  setSync();
  if (!evId && !['evento', 'receitas', 'cadastros'].includes(page)) page = 'evento';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
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

function hoje() {
  const e = ev(), t0 = today(), ts = tasks(), r = reservas(), per = periodo();
  const noPeriodo = ts.filter(t => t.data && t.data >= per.de && t.data <= per.ate && !(prefs.ocultarFeitas && isDone(t)));
  const pendPeriodo = noPeriodo.filter(t => !isDone(t)).length;
  const late = ts.filter(t => t.data && t.data < t0 && !isDone(t));
  const done = ts.filter(isDone).length, pct = ts.length ? Math.round(done / ts.length * 100) : 0;
  const avisos = [];
  if (e.prazo_pagamento) {
    const dp = diffDays(e.prazo_pagamento, t0);
    if (dp >= 0 && dp <= 3 && r.lista.length) avisos.push([`Prazo de pagamento ${dp === 0 ? 'é hoje' : `em ${dp} dia(s)`}: ${r.lista.length} na lista sem pagar`, 'reservas']);
    if (dp < 0 && r.lista.length) avisos.push([`Prazo passou: ${r.lista.length} da lista não pagaram. Liberar as vagas para a espera (${r.espera.length})`, 'reservas', 1]);
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
  const dP = e.prazo_pagamento ? diffDays(e.prazo_pagamento, t0) : null;
  const dias = new Map(); noPeriodo.forEach(t => { if (!dias.has(t.data)) dias.set(t.data, []); dias.get(t.data).push(t); });
  const titulo = per.de === per.ate ? (per.de === t0 ? 'Hoje' : per.de === addDays(t0, 1) ? 'Amanhã' : fmtLong(per.de)) : `${fmtLong(per.de)} a ${fmtLong(per.ate)}`;
  const chip = (k, l) => `<button class="${per.p === k ? 'active' : ''}" data-periodo="${k}">${l}</button>`;
  $('#main').innerHTML = head('Início', `${fmtLong(t0)} · escolha o período para ver as tarefas.`,
      MODE === 'n8n' ? '<button class="btn light small" data-act="resumo">Mandar o resumo por e-mail agora</button>' : '') + `
    <div class="grid four">
      <div class="card kpi accent"><div class="lbl">TAREFAS</div><div class="num">${pct}%</div><div class="bar"><i style="width:${pct}%"></i></div><div class="mini">${done} de ${ts.length} feitas</div></div>
      <div class="card kpi"><div class="lbl">ATRASADAS</div><div class="num" style="color:${late.length ? 'var(--red)' : 'var(--green)'}">${late.length}</div><div class="mini">prazo anterior a hoje</div></div>
      <div class="card kpi"><div class="lbl">PAGOS</div><div class="num">${r.pagos.length}<small> / ${r.cap || '?'}</small></div><div class="mini">${r.lista.length} na lista · ${r.espera.length} na espera</div></div>
      <div class="card kpi"><div class="lbl">PRAZO DE PAGAMENTO</div><div class="num" style="font-size:1.5rem">${e.prazo_pagamento ? esc(fmtLong(e.prazo_pagamento)) : '—'}</div><div class="mini">${dP == null ? 'não definido' : dP > 0 ? `em ${dP} dia(s)` : dP === 0 ? 'é hoje' : 'encerrado'}</div></div>
    </div>
    <div class="card accent" style="margin-top:16px">
      <div class="toolbar" style="margin-bottom:10px">
        <div class="subtabs" style="margin:0">${chip('hoje', 'Hoje')}${chip('amanha', 'Amanhã')}${chip('semana', 'Esta semana')}${chip('7dias', 'Próximos 7 dias')}${e.data && e.data >= t0 ? chip('evento', 'Até o evento') : ''}</div>
        <label class="f">De<input type="date" id="per-de" value="${per.de}"></label>
        <label class="f">Até<input type="date" id="per-ate" value="${per.ate}"></label>
        <label class="chk"><input type="checkbox" id="ocultar" ${prefs.ocultarFeitas ? 'checked' : ''}> ocultar feitas</label>
      </div>
      <h3>${esc(titulo)} <span class="mini">· ${pendPeriodo} pendente(s)${noPeriodo.length - pendPeriodo ? `, ${noPeriodo.length - pendPeriodo} feita(s)` : ''}</span></h3>
      ${[...dias].map(([d, l]) => `${per.de !== per.ate ? `<div class="group-h">${esc(fmtLong(d))}${d === t0 ? ' <span class="pill dark">hoje</span>' : ''}</div>` : ''}${l.map(t => taskHTML(t)).join('')}`).join('') || '<p class="empty">Nenhuma tarefa nesse período.</p>'}
    </div>
    <div class="grid" style="margin-top:16px">
      <div class="card"><h3>Atrasadas (${late.length})</h3>${late.map(t => taskHTML(t, { date: 1 })).join('') || '<p class="empty">Tudo em dia.</p>'}</div>
      <div class="card"><h3>Avisos</h3>${avisos.length ? `<ul class="alerts">${avisos.map(([m, p, bad]) => `<li class="${bad ? 'bad' : ''}">${esc(m)} <button class="linkbtn" data-nav="${p}">abrir</button></li>`).join('')}</ul>` : '<p class="empty">Nenhum aviso.</p>'}</div>
    </div>`;
}

function tarefas() {
  const all = tasks(), t0 = today();
  const shown = all.filter(t => !(prefs.ocultarFeitas && isDone(t)));
  const groups = new Map();
  if (prefs.tarefasPor === 'fase') {
    [...L.fases, ...new Set(shown.map(t => t.fase).filter(f => !L.fases.includes(f)))].forEach(f => groups.set(f, []));
    shown.forEach(t => { if (!groups.has(t.fase || 'Sem fase')) groups.set(t.fase || 'Sem fase', []); groups.get(t.fase || 'Sem fase').push(t); });
  } else shown.forEach(t => { const k = t.data || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
  const label = k => prefs.tarefasPor === 'fase' ? esc(k) : k ? esc(fmtLong(k)) + (k === t0 ? ' <span class="pill dark">hoje</span>' : '') : 'Sem data';
  $('#main').innerHTML = head('Tarefas', 'Toque no círculo para concluir e no nome para editar. Data e horário dá para mudar direto na lista.',
      '<button class="btn small" data-act="nova-tarefa">+ Nova tarefa</button><button class="btn small light" data-act="gerar-producao">Gerar plano de produção</button>') + `
    <div class="toolbar">
      <div class="subtabs" style="margin:0"><button class="${prefs.tarefasPor === 'data' ? 'active' : ''}" data-pref="tarefasPor" data-val="data">Por data</button><button class="${prefs.tarefasPor === 'fase' ? 'active' : ''}" data-pref="tarefasPor" data-val="fase">Por fase</button></div>
      <label class="chk"><input type="checkbox" id="ocultar" ${prefs.ocultarFeitas ? 'checked' : ''}> ocultar feitas</label>
      <span class="mini">${all.filter(isDone).length} de ${all.length} feitas</span>
    </div>
    <div class="card">${[...groups].filter(([, l]) => l.length).map(([k, l]) => `<div class="group-h ${prefs.tarefasPor === 'data' && k && k < t0 && l.some(t => !isDone(t)) ? 'late' : ''}">${label(k)}</div>
      ${l.map(t => taskHTML(t, { edit: 1, date: prefs.tarefasPor === 'fase' })).join('')}`).join('') || '<p class="empty">Nenhuma tarefa.</p>'}</div>
    <p class="mini" style="margin-top:12px">O plano de produção cria uma tarefa para cada passo das receitas <b>aprovadas</b> no Cardápio, na data e hora que o passo pede. Rodar de novo atualiza sem duplicar.</p>`;
}

function telaReservas() {
  const e = ev(), r = reservas(), t0 = today(), dP = e.prazo_pagamento ? diffDays(e.prazo_pagamento, t0) : null;
  const nomes = DB.Pessoas.filter(live).map(p => p.nome);
  const sugerido = r.pagos.length + r.lista.length >= r.cap && r.cap ? 'Espera' : 'Lista';
  const linha = (x, i) => { const p = pessoa(x.pessoa_id);
    return row(`${cell(`<span class="rowtitle">${i != null ? `${i + 1}. ` : ''}${esc(p.nome)}</span><small>${esc([p.telefone, p.instagram, p.restricao && '⚠ ' + p.restricao].filter(Boolean).join(' · ') || 'sem contato')}</small>`, 4, 1)}
      ${field('Reservas', x, { f: 'status', l: 'Status', t: 'select', o: L.reserva })}
      ${field('Reservas', x, { f: 'entrada', l: 'Entrou em', t: 'date' })}
      ${x.status === 'Pago' ? field('Reservas', x, { f: 'pagamento', l: 'Pagou em', t: 'date' }) + field('Reservas', x, { f: 'valor_pago', l: 'Valor R$', t: 'num', ph: fmtNum(num(e.valor_ingresso)), w: 1 })
        : `<div class="cell" style="--w:3">${x.status !== 'Desistiu' ? `<button class="btn small" data-pagou="${esc(x.id)}">Pagou</button>` : ''}</div>`}
      ${xbtn('Reservas', x.id, 'reserva')}`, x.status === 'Desistiu' ? 'off' : ''); };
  const bloco = (titulo, list, numbered, vazio) => `<h4>${titulo} (${list.length})</h4>${list.map((x, i) => linha(x, numbered ? i : null)).join('') || `<p class="empty">${vazio}</p>`}`;
  let aviso = '';
  if (dP != null && dP < 0 && r.lista.length) aviso = `<div class="notice bad"><b>O prazo de pagamento passou.</b> ${r.lista.length} pessoa(s) da lista não pagaram. Avise que a vaga foi liberada (mude para <i>Desistiu</i>) e chame a espera: quem pagar primeiro fica.</div>`;
  else if (dP != null && dP < 0 && r.vagas && r.espera.length) aviso = `<div class="notice warn">${r.vagas} vaga(s) aberta(s). A espera já pode pagar: quem pagar primeiro fica.</div>`;
  else if (dP != null && dP >= 0) aviso = `<div class="notice">Prazo de pagamento: <b>${esc(fmtLong(e.prazo_pagamento))}</b>${dP ? ` (em ${dP} dia${dP > 1 ? 's' : ''})` : ' (hoje)'}. Até lá, quem não pagou segue na lista; quem chega com a lista cheia vai para a espera.</div>`;
  $('#main').innerHTML = head('Reservas', `Cada reserva é uma pessoa. Ingresso: ${num(e.valor_ingresso) != null ? money(num(e.valor_ingresso)) : '<b>sem valor</b> (aba Evento)'}.`) + aviso + `
    <div class="card accent">
      <div class="totals" style="margin-bottom:14px"><span>Pagos <b>${r.pagos.length}/${r.cap || '?'}</b></span><span>Vagas <b>${r.vagas}</b></span><span>Lista <b>${r.lista.length}</b></span><span>Espera <b>${r.espera.length}</b></span><span>Recebido <b>${money(r.pagos.reduce((s, x) => s + valorReserva(x), 0))}</b></span></div>
      <form id="f-reserva" class="toolbar" style="margin:0" autocomplete="off">
        <label class="f" style="flex:2 1 200px">Nome<input name="nome" list="dl-pessoas" required placeholder="quem já veio aparece na lista"></label>
        <label class="f" style="flex:1 1 150px">Telefone / @<input name="contato" placeholder="opcional"></label>
        <label class="f" style="flex:0 1 140px">Entra como<select name="status">${opts(L.reserva.slice(0, 3), sugerido)}</select></label>
        <button class="btn">Adicionar</button>
      </form>
      ${datalist('dl-pessoas', nomes)}
    </div>
    <div class="card">${bloco('Pagos · lugar confirmado', r.pagos, false, 'Ninguém pagou ainda.')}${bloco('Lista · reservou, falta pagar', r.lista, false, 'Ninguém na lista.')}${bloco('Espera · por ordem de chegada', r.espera, true, 'Ninguém na espera.')}
      ${r.desist.length ? `<details style="margin-top:14px"><summary class="mini">Desistiram (${r.desist.length})</summary>${r.desist.map(x => linha(x)).join('')}</details>` : ''}</div>
    <p class="mini" style="margin-top:12px">Telefone, @ e restrição alimentar ficam em Cadastros → Pessoas e valem para os próximos eventos.</p>`;
}

function cardapio() {
  const base = basePessoas(), bebidas = of('Bebidas').map(b => [b.id, b.rotulo]);
  const recs = DB.Receitas.filter(live).sort((a, b) => a.nome.localeCompare(b.nome));
  const cs = of('Cardapio').sort((a, b) => (num(a.ordem) ?? 99) - (num(b.ordem) ?? 99) || (receita(a.receita_id)?.nome || '').localeCompare(receita(b.receita_id)?.nome || ''));
  $('#main').innerHTML = head('Cardápio', 'Pratos do evento, na ordem de serviço. Só os <b>aprovados</b> entram na lista de mercado e no plano de produção.',
      '<button class="btn small light" data-act="gerar-producao">Gerar plano de produção</button>') + `
    <div class="card accent">
      <form id="f-prato" class="toolbar" style="margin:0" autocomplete="off">
        <label class="f" style="flex:2 1 240px">Prato (receita do livro ou nova)<input name="nome" list="dl-receitas" required></label>
        <label class="f" style="flex:0 1 90px">Ordem<input name="ordem" inputmode="numeric" value="${(Math.max(0, ...cs.map(c => num(c.ordem) || 0)) || 0) + 1}"></label>
        <button class="btn">Adicionar</button>
      </form>${datalist('dl-receitas', recs.map(r => r.nome))}
    </div>
    <div class="card">${cs.map(c => { const r = receita(c.receita_id), falta = r ? receitaIncompleta(r) : ['receita'], pp = num(c.porcoes_pessoa);
      return row(`${field('Cardapio', c, { f: 'ordem', l: 'Ordem', t: 'num', w: 1 })}
        ${cell(`<span class="rowtitle">${esc(r?.nome || '(receita removida)')}</span><small>${falta.length ? `falta: ${falta.join(', ')}` : `rende ${esc(r.rende)} porções`} · <button class="linkbtn" data-open-rec="${esc(c.receita_id)}">abrir receita</button></small>`, 3)}
        ${field('Cardapio', c, { f: 'porcoes_pessoa', l: 'Porções/pessoa', t: 'num', w: 1 })}
        ${cell(`<b>${pp ? fmtNum(pp * base.n, 1) : '—'}</b><small>porções p/ ${base.n}</small>`, 1)}
        ${field('Cardapio', c, { f: 'status', l: 'Status', t: 'select', o: L.prato })}
        ${field('Cardapio', c, { f: 'bebida_id', l: 'Harmonização', t: 'select', o: bebidas, blank: '—', w: 2 })}
        ${xbtn('Cardapio', c.id, 'prato')}
        ${field('Cardapio', c, { f: 'teste', l: 'Teste / anotações', ph: 'data do teste, resultado, o que ajustar', w: 11, wide: 1 })}`, c.status === 'Descartado' ? 'off' : ''); }).join('') || '<p class="empty">Nenhum prato ainda.</p>'}</div>
    <p class="mini" style="margin-top:12px">Porções calculadas para ${base.n} pessoas (${esc(base.label)}). Dá para mudar a base em Compras.</p>`;
}

function telaReceitas() {
  const q = (prefs.busca || '').toLowerCase();
  const recs = DB.Receitas.filter(live).sort((a, b) => a.nome.localeCompare(b.nome));
  if (!recSel || !receita(recSel) || !live(receita(recSel))) recSel = (of('Cardapio').map(c => c.receita_id).find(id => receita(id)) || recs[0]?.id) || null;
  const noEvento = new Set(of('Cardapio').map(c => c.receita_id));
  const r = recSel ? receita(recSel) : null;
  let editor = '<p class="empty">Nenhuma receita. Crie a primeira.</p>';
  if (r) {
    const itens = itensDe(r.id), passos = passosDe(r.id), falta = receitaIncompleta(r);
    const usos = DB.Cardapio.filter(c => live(c) && c.receita_id === r.id).map(c => byId('Eventos', c.evento_id)?.nome).filter(Boolean);
    editor = `
      <div class="card accent">
        <div class="head" style="margin-bottom:10px"><div><h3 style="margin:0">${esc(r.nome)}</h3><p class="mini">${falta.length ? `Falta: ${falta.join(', ')}` : 'Receita completa'}${usos.length ? ` · usada em: ${esc([...new Set(usos)].join(', '))}` : ''}</p></div>
          <button class="btn small danger" data-del="Receitas|${esc(r.id)}">Excluir receita</button></div>
        <div class="row" style="padding-top:0">
          ${field('Receitas', r, { f: 'nome', l: 'Nome', w: 5, wide: 1 })}
          ${field('Receitas', r, { f: 'categoria', l: 'Categoria', list: 'dl-cat', w: 3 })}
          ${field('Receitas', r, { f: 'rende', l: 'Rende (porções)', t: 'num', w: 2 })}
          ${field('Receitas', r, { f: 'status', l: 'Status', t: 'select', o: L.receita, w: 2 })}
          ${field('Receitas', r, { f: 'preparo', l: 'Modo de preparo', t: 'textarea', w: 12, wide: 1 })}
          ${field('Receitas', r, { f: 'observacoes', l: 'Observações', t: 'textarea', w: 12, wide: 1 })}
        </div>
      </div>
      <div class="card">
        <h3>Ingredientes <span class="mini">(quantidade para o rendimento acima; vazio = a gosto)</span></h3>
        ${itens.map(i => { const g = ingrediente(i.ingrediente_id) || { id: '', nome: '?' };
          return row(`<label class="f" style="--w:4">Ingrediente<input data-item-ing="${esc(i.id)}" list="dl-ing" value="${esc(g.nome)}"></label>
            ${field('Receita_Itens', i, { f: 'quantidade', l: 'Qtd', t: 'num', w: 1, ph: 'a gosto' })}
            ${g.id ? field('Ingredientes', g, { f: 'unidade', l: 'Unidade', t: 'select', o: L.unidades, blank: '—', w: 2 }) : cell('', 2)}
            ${field('Receita_Itens', i, { f: 'observacao', l: 'Obs.', w: 2, ph: 'ex.: só a gema' })}
            ${cell(g.id ? `<small>${esc(compraResumo(g))}</small><button class="linkbtn" data-ing-dlg="${esc(g.id)}">compra</button>` : '', 2)}
            ${xbtn('Receita_Itens', i.id, 'ingrediente')}`); }).join('') || '<p class="empty">Nenhum ingrediente ainda.</p>'}
        <form id="f-item" class="toolbar" style="margin:14px 0 0" autocomplete="off">
          <label class="f" style="flex:2 1 200px">Ingrediente<input name="nome" list="dl-ing" required></label>
          <label class="f" style="flex:0 1 90px">Qtd<input name="qtd" inputmode="decimal" placeholder="a gosto"></label>
          <label class="f" style="flex:0 1 130px">Unidade (se novo)<select name="unidade">${opts(L.unidades, 'colher')}</select></label>
          <button class="btn">Adicionar</button>
        </form>
      </div>
      <div class="card">
        <h3>Passos <span class="mini">(viram tarefas no plano de produção)</span></h3>
        ${passos.map(p => row(`${field('Receita_Passos', p, { f: 'ordem', l: 'Nº', t: 'num', w: 1 })}
          ${field('Receita_Passos', p, { f: 'passo', l: 'Passo', w: 5, wide: 1 })}
          ${field('Receita_Passos', p, { f: 'quando', l: 'Quando', t: 'select', o: [['dias', 'dias antes'], ['horas', 'horas antes do início']] })}
          ${field('Receita_Passos', p, { f: 'antes', l: p.quando === 'dias' ? 'Dias antes' : 'Horas antes', t: 'num', w: 1 })}
          ${cell(`<small>${esc(quandoTxt(p))}</small>`, 2)}
          ${xbtn('Receita_Passos', p.id, 'passo')}
          ${field('Receita_Passos', p, { f: 'duracao_min', l: 'Duração (min)', t: 'num', w: 2 })}
          ${field('Receita_Passos', p, { f: 'equipamento', l: 'Equipamento', list: 'dl-equip', w: 3 })}
          ${field('Receita_Passos', p, { f: 'conservacao', l: 'Como guardar', w: 6, wide: 1 })}`)).join('') || '<p class="empty">Nenhum passo ainda.</p>'}
        <div style="margin-top:12px"><button class="btn small light" data-act="novo-passo">+ Passo</button></div>
      </div>`;
  }
  $('#main').innerHTML = head('Receitas', 'O livro de receitas do Gato Véio: fica guardado de um evento para o outro.', '<button class="btn small" data-act="nova-receita">+ Nova receita</button>') + `
    <div class="split">
      <div class="card" style="padding:12px">
        <input id="busca" placeholder="Buscar receita" value="${esc(prefs.busca)}" style="margin-bottom:8px">
        <div class="reclist">${recs.filter(x => !q || x.nome.toLowerCase().includes(q)).map(x => `<button class="${x.id === recSel ? 'active' : ''}" data-pick-rec="${esc(x.id)}">${esc(x.nome)}<small>${esc(x.categoria || '—')}${noEvento.has(x.id) ? ' · neste evento' : ''}${receitaIncompleta(x).length ? ' · incompleta' : ''}</small></button>`).join('')}</div>
      </div>
      <div>${editor}</div>
    </div>
    ${datalist('dl-ing', DB.Ingredientes.filter(live).map(g => g.nome).sort())}${datalist('dl-cat', L.categorias)}${datalist('dl-equip', L.equip)}`;
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
  const base = basePessoas(), cs = of('Compras');
  const ordem = ['Açougue', 'Feira', 'Mercado', 'Empório', 'Atacado', 'Padaria', 'Vinícola', 'Outro'];
  const grupos = new Map(); [...ordem, ...new Set(cs.map(c => c.onde_comprar || 'Outro'))].forEach(o => grupos.set(o, []));
  cs.sort((a, b) => (a.status === 'Comprar' ? 0 : 1) - (b.status === 'Comprar' ? 0 : 1) || a.item.localeCompare(b.item)).forEach(c => grupos.get(c.onde_comprar || 'Outro').push(c));
  const pend = cs.filter(c => c.status === 'Comprar').length, total = cs.reduce((s, c) => s + (num(c.custo) || 0), 0);
  const { skipped } = shoppingNeeds(base.n || 1);
  $('#main').innerHTML = head('Compras', 'Lista de mercado gerada das receitas aprovadas + itens avulsos.') + `
    <div class="card accent">
      <div class="toolbar">
        <label class="f">Calcular para<select id="base">${opts([['auto', 'Automático'], ['pagos', `Pagos (${reservas().pagos.length})`], ['capacidade', `Capacidade (${reservas().cap})`], ['outro', 'Outro número']], prefs.base)}</select></label>
        ${prefs.base === 'outro' ? `<label class="f">Pessoas<input id="baseN" inputmode="numeric" value="${esc(prefs.baseN)}" style="width:90px"></label>` : ''}
        <button class="btn" data-act="gerar-compras">Gerar / atualizar lista (${base.n} pessoas)</button>
      </div>
      <p class="mini" style="margin:0">Base atual: ${base.n} pessoas (${esc(base.label)}). Atualizar a lista recalcula as quantidades e mantém o que vocês já marcaram como <i>Já tenho</i> ou <i>Comprado</i>.${skipped.length ? `<br><b>Fora da conta</b> (aprovados sem receita completa): ${esc(skipped.join(', '))}.` : ''}</p>
      <div class="totals" style="margin-top:10px"><span>Pendentes <b>${pend}</b></span><span>Itens <b>${cs.length}</b></span><span>Gasto registrado <b>${money(total)}</b></span></div>
    </div>
    <div class="card">
      ${[...grupos].filter(([, l]) => l.length).map(([g, l]) => `<h4>${esc(g)} (${l.filter(c => c.status === 'Comprar').length} pendente${l.filter(c => c.status === 'Comprar').length === 1 ? '' : 's'})</h4>` + l.map(c => row(`
        ${c.origem === 'Gerada' ? cell(`<span class="rowtitle">${esc(c.item)}</span><small>${esc(c.observacao)}</small>`, 4, 1) : field('Compras', c, { f: 'item', l: 'Item avulso', w: 4, wide: 1 })}
        ${field('Compras', c, { f: 'quantidade', l: 'Qtd', w: 1 })}
        ${field('Compras', c, { f: 'unidade', l: 'Unidade', w: 1 })}
        ${field('Compras', c, { f: 'status', l: 'Status', t: 'select', o: L.compra })}
        ${field('Compras', c, { f: 'custo', l: 'Custo R$', t: 'num', w: 1 })}
        ${field('Compras', c, { f: 'onde_comprar', l: 'Onde', list: 'dl-onde', w: 2 })}
        ${xbtn('Compras', c.id, 'item')}`, c.status !== 'Comprar' ? 'off' : '')).join('')).join('') || '<p class="empty">Lista vazia. Gere a partir das receitas ou adicione itens avulsos.</p>'}
      <form id="f-compra" class="toolbar" style="margin:16px 0 0" autocomplete="off">
        <label class="f" style="flex:2 1 200px">Item avulso<input name="item" required placeholder="gelo, carvão, guardanapo…"></label>
        <label class="f" style="flex:0 1 90px">Qtd<input name="qtd"></label>
        <label class="f" style="flex:1 1 140px">Onde<input name="onde" list="dl-onde" value="Mercado"></label>
        <button class="btn">Adicionar</button>
      </form>
    </div>${datalist('dl-onde', L.onde)}`;
}

function bebidas() {
  const bs = of('Bebidas'), forn = DB.Fornecedores.filter(live).map(f => [f.id, f.nome]);
  const pratos = of('Cardapio').filter(c => c.status !== 'Descartado');
  const acerto = new Map();
  bs.forEach(b => { const c = bebidaCalc(b), k = byId('Fornecedores', b.fornecedor_id)?.nome || 'Sem fornecedor', a = acerto.get(k) || { consumidas: 0, pagar: 0, devolver: 0 };
    a.consumidas += c.consumidas || 0; a.pagar += c.pagar || 0; if (b.modalidade !== 'Comprado') a.devolver += num(b.devolvidas) || 0; acerto.set(k, a); });
  $('#main').innerHTML = head('Bebidas', `Preço livre por rótulo. Taça = 150 ml, ${TACAS} taças por garrafa.`, '<button class="btn small" data-act="nova-bebida">+ Bebida</button>') + `
    <div class="card accent"><h3>Acerto com fornecedores</h3><p class="mini" style="margin-top:-6px">Preencha garrafas recebidas e, no dia seguinte, as devolvidas (fechadas). Consumidas = recebidas − devolvidas.</p>
      <div class="scroll"><table class="t"><tr><th>Fornecedor</th><th class="n">Consumidas</th><th class="n">Devolver</th><th class="n">A pagar</th></tr>
      ${[...acerto].map(([k, a]) => `<tr><td>${esc(k)}</td><td class="n">${a.consumidas}</td><td class="n">${a.devolver}</td><td class="n">${money(a.pagar)}</td></tr>`).join('')}
      <tr class="sum"><td>Total</td><td class="n">${[...acerto.values()].reduce((s, a) => s + a.consumidas, 0)}</td><td class="n">${[...acerto.values()].reduce((s, a) => s + a.devolver, 0)}</td><td class="n">${money([...acerto.values()].reduce((s, a) => s + a.pagar, 0))}</td></tr></table></div></div>
    <div class="card">${bs.map(b => { const c = bebidaCalc(b), harm = pratos.filter(p => p.bebida_id === b.id).map(p => receita(p.receita_id)?.nome).filter(Boolean);
      return row(`${field('Bebidas', b, { f: 'rotulo', l: 'Rótulo', w: 4, wide: 1 })}
        ${field('Bebidas', b, { f: 'fornecedor_id', l: 'Fornecedor', t: 'select', o: forn, blank: '—', w: 3 })}
        ${field('Bebidas', b, { f: 'tipo', l: 'Tipo', list: 'dl-btipo', w: 2 })}
        ${field('Bebidas', b, { f: 'modalidade', l: 'Modalidade', t: 'select', o: L.modalidade, w: 2 })}
        ${xbtn('Bebidas', b.id, 'bebida')}
        ${field('Bebidas', b, { f: 'custo_garrafa', l: 'Custo garrafa', t: 'num' })}
        ${field('Bebidas', b, { f: 'preco_garrafa', l: 'Preço garrafa', t: 'num' })}
        ${field('Bebidas', b, { f: 'preco_taca', l: 'Preço taça', t: 'num' })}
        ${field('Bebidas', b, { f: 'recebidas', l: 'Recebidas', t: 'num', w: 1 })}
        ${field('Bebidas', b, { f: 'devolvidas', l: 'Devolvidas', t: 'num', w: 1 })}
        ${cell(`<b>${c.consumidas ?? '—'}</b> consumidas<small>a pagar ${money(c.pagar)}</small>`, 3)}
        ${cell(`<small>custo/taça ${money(c.custoTaca)} · margem garrafa ${money(c.margemGarrafa)} · margem taça ${money(c.margemTaca)}${harm.length ? ` · com ${esc(harm.join(', '))}` : ''}</small>`, 6, 1)}
        ${field('Bebidas', b, { f: 'observacao', l: 'Observação', w: 6, wide: 1 })}`); }).join('') || '<p class="empty">Nenhuma bebida ainda.</p>'}</div>
    ${datalist('dl-btipo', L.bebidaTipo)}`;
}

function telaEvento() {
  const e = ev(), list = events(), sug = sugestaoNovoEvento();
  const fc = evId ? fechamento() : null;
  $('#main').innerHTML = head('Evento', 'Dados, custos extras, fechamento e novos eventos.') + `
    <div class="grid">
      ${evId ? `<div class="card accent full">
        <div class="head" style="margin-bottom:6px"><h3 style="margin:0">Dados do evento</h3>
          ${list.length > 1 ? `<label class="f">Trocar de evento<select id="ev-pick">${list.map(x => `<option value="${esc(x.id)}" ${x.id === evId ? 'selected' : ''}>${esc(fmt(x.data))}/${esc((x.data || '').slice(2, 4))} · ${esc(x.nome)}</option>`).join('')}</select></label>` : ''}</div>
        <div class="row" style="padding-top:0;border:0">
          ${field('Eventos', e, { f: 'nome', l: 'Nome', w: 4, wide: 1 })}
          ${field('Eventos', e, { f: 'tema', l: 'Tema (comida)', w: 4 })}
          ${field('Eventos', e, { f: 'formato', l: 'Formato', list: 'dl-formato', w: 4 })}
          ${field('Eventos', e, { f: 'data', l: 'Data', t: 'date', w: 3 })}
          ${field('Eventos', e, { f: 'hora', l: 'Início', t: 'time', w: 2 })}
          ${field('Eventos', e, { f: 'capacidade', l: 'Lugares', t: 'num', w: 2 })}
          ${field('Eventos', e, { f: 'valor_ingresso', l: 'Ingresso R$', t: 'num', w: 2 })}
          ${field('Eventos', e, { f: 'prazo_pagamento', l: 'Prazo de pagamento', t: 'date', w: 3 })}
          ${field('Eventos', e, { f: 'status', l: 'Status', t: 'select', o: L.evento, w: 3 })}
          ${field('Eventos', e, { f: 'notas', l: 'Notas e combinados', t: 'textarea', w: 9, wide: 1 })}
        </div>
      </div>
      <div class="card">
        <h3>Custos extras</h3><p class="mini" style="margin-top:-6px">Ajudante, fogueira, gelo… o que for definido na Ideia.</p>
        ${of('Custos').map(c => row(`${field('Custos', c, { f: 'descricao', l: 'Descrição', w: 4, wide: 1 })}${field('Custos', c, { f: 'categoria', l: 'Categoria', list: 'dl-ccat', w: 3 })}${field('Custos', c, { f: 'valor', l: 'Valor R$', t: 'num', w: 2 })}${field('Custos', c, { f: 'pago', l: 'Pago?', t: 'select', o: ['não', 'sim'], w: 2 })}${xbtn('Custos', c.id, 'custo')}`)).join('') || '<p class="empty">Nenhum custo extra.</p>'}
        <div style="margin-top:12px"><button class="btn small light" data-act="novo-custo">+ Custo</button></div>
      </div>
      <div class="card">
        <h3>Fechamento</h3>
        <label class="f" style="margin-bottom:10px">Total vendido em bebidas no dia (soma das comandas) R$<input data-e="Eventos|${esc(e.id)}|vendas_bebidas" inputmode="decimal" value="${esc(e.vendas_bebidas)}"></label>
        <table class="t">
          <tr><td>Ingressos pagos</td><td class="n">${money(fc.ingressos)}</td></tr>
          <tr><td>Bebidas vendidas</td><td class="n">${money(fc.bebidasVendidas)}</td></tr>
          <tr><td>Compras (custo lançado)</td><td class="n">− ${money(fc.compras)}</td></tr>
          <tr><td>Custos extras</td><td class="n">− ${money(fc.custos)}</td></tr>
          <tr><td>Acerto com vinícolas</td><td class="n">− ${money(fc.vinicolas)}</td></tr>
          <tr class="sum"><td>Resultado</td><td class="n" style="color:${fc.resultado < 0 ? 'var(--red)' : 'var(--green)'}">${money(fc.resultado)}</td></tr>
        </table>
      </div>` : ''}
      <div class="card ${evId ? '' : 'accent'}">
        <h3>Novo evento</h3>
        <p class="mini" style="margin-top:-6px">Cria as tarefas a partir do modelo (Cadastros → Modelo de tarefas). Datas sugeridas: último sábado do mês e prazo de pagamento no dia 15. Prazos que caem no fim de semana vão para a sexta anterior; depois é só revisar em Tarefas.</p>
        <form id="f-evento" class="form-grid">
          <label class="f wide">Nome<input name="nome" required placeholder="Gato Véio · Novembro"></label>
          <label class="f">Tema (comida)<input name="tema"></label>
          <label class="f">Formato<input name="formato" list="dl-formato"></label>
          <label class="f">Data<input name="data" type="date" required value="${sug.data}"></label>
          <label class="f">Início<input name="hora" type="time" value="19:00"></label>
          <label class="f">Lugares<input name="capacidade" inputmode="numeric" value="24"></label>
          <label class="f">Ingresso R$<input name="valor" inputmode="decimal" value="${esc(e.valor_ingresso || '')}"></label>
          <label class="f">Prazo de pagamento<input name="prazo" type="date" value="${sug.prazo}"></label>
          <div class="wide"><button class="btn">Criar evento</button></div>
        </form>
      </div>
      <div class="card">
        <h3>Conexão</h3>
        ${MODE === 'n8n' ? `<p>Dados na planilha Google via n8n. Vocês dois veem e alteram as mesmas informações.</p>
          <div class="toolbar"><button class="btn small light" data-act="recarregar">Buscar últimas alterações</button><button class="btn small ghost" data-act="sair">Sair</button></div>`
        : `<div class="notice warn">Modo de teste: dados de exemplo, salvos só neste navegador. Para usar de verdade, coloque o endereço do n8n no <b>config.js</b> (veja o README).</div>
          <button class="btn small danger" data-act="reset">Voltar aos dados iniciais</button>`}
        <div class="toolbar" style="margin-top:10px"><button class="btn small ghost" data-act="exportar">Baixar cópia dos dados (.json)</button></div>
      </div>
    </div>${datalist('dl-formato', L.formato)}${datalist('dl-ccat', L.custoCat)}`;
}

function cadastros() {
  const sub = prefs.cad, tabs = [['pessoas', 'Pessoas'], ['fornecedores', 'Fornecedores'], ['ingredientes', 'Ingredientes'], ['modelo', 'Modelo de tarefas']];
  let body = '', addAct = '';
  if (sub === 'pessoas') {
    const ps = DB.Pessoas.filter(live).sort((a, b) => a.nome.localeCompare(b.nome));
    const vezes = id => DB.Reservas.filter(r => live(r) && r.pessoa_id === id && r.status === 'Pago').length;
    body = ps.map(p => row(`${field('Pessoas', p, { f: 'nome', l: 'Nome', w: 3, wide: 1 })}${field('Pessoas', p, { f: 'telefone', l: 'Telefone' })}${field('Pessoas', p, { f: 'instagram', l: 'Instagram' })}${field('Pessoas', p, { f: 'restricao', l: 'Restrição alimentar', w: 2 })}${cell(`<small>${vezes(p.id)} evento(s) pago(s)</small>`, 2)}${xbtn('Pessoas', p.id, 'pessoa')}${field('Pessoas', p, { f: 'observacoes', l: 'Observações', w: 11, wide: 1 })}`)).join('');
    addAct = 'nova-pessoa';
  } else if (sub === 'fornecedores') {
    body = DB.Fornecedores.filter(live).map(f => row(`${field('Fornecedores', f, { f: 'nome', l: 'Nome', w: 3, wide: 1 })}${field('Fornecedores', f, { f: 'tipo', l: 'Tipo', list: 'dl-ftipo' })}${field('Fornecedores', f, { f: 'cidade', l: 'Cidade' })}${field('Fornecedores', f, { f: 'contato', l: 'Contato', w: 3 })}${xbtn('Fornecedores', f.id, 'fornecedor')}${field('Fornecedores', f, { f: 'observacoes', l: 'Observações', w: 11, wide: 1 })}`)).join('') + datalist('dl-ftipo', L.fornTipo);
    addAct = 'novo-fornecedor';
  } else if (sub === 'ingredientes') {
    body = `<p class="mini">A conversão diz quanto comprar: “1 colher = 0,25 cebola”. Sem conversão, a lista mostra na unidade da receita. Arredondar = comprar inteiro (cebola sim, carne não).</p>` +
      DB.Ingredientes.filter(live).sort((a, b) => a.nome.localeCompare(b.nome)).map(g => row(`${field('Ingredientes', g, { f: 'nome', l: 'Nome', w: 3, wide: 1 })}${field('Ingredientes', g, { f: 'unidade', l: 'Unidade na receita', t: 'select', o: L.unidades, blank: '—' })}${field('Ingredientes', g, { f: 'compra_fator', l: '1 unid. = quanto', t: 'num', w: 1 })}${field('Ingredientes', g, { f: 'compra_unidade', l: 'Unidade de compra', ph: 'cebola, maço, pote' })}${field('Ingredientes', g, { f: 'arredondar', l: 'Arredondar', t: 'select', o: ['não', 'sim'], w: 1 })}${field('Ingredientes', g, { f: 'onde_comprar', l: 'Onde comprar', list: 'dl-onde' })}${xbtn('Ingredientes', g.id, 'ingrediente')}`)).join('') + datalist('dl-onde', L.onde);
    addAct = 'novo-ingrediente';
  } else {
    body = `<p class="mini">Referência: <b>D</b> = dias em relação ao evento (−30 = 30 dias antes), <b>P</b> = dias em relação ao prazo de pagamento, <b>H</b> = horas em relação ao início, no dia do evento (−7 = 7 horas antes). Vale para os próximos eventos; não muda os que já existem.</p>` +
      DB.Modelo_Tarefas.filter(live).map(m => row(`${field('Modelo_Tarefas', m, { f: 'fase', l: 'Fase', list: 'dl-fases' })}${field('Modelo_Tarefas', m, { f: 'tarefa', l: 'Tarefa', w: 5, wide: 1 })}${field('Modelo_Tarefas', m, { f: 'ref', l: 'Ref.', t: 'select', o: [['D', 'D · evento'], ['P', 'P · pagamento'], ['H', 'H · horas no dia']], w: 2 })}${field('Modelo_Tarefas', m, { f: 'desloc', l: 'Deslocamento', t: 'num', w: 2 })}${xbtn('Modelo_Tarefas', m.id, 'tarefa do modelo')}`)).join('') + datalist('dl-fases', L.fases);
    addAct = 'novo-modelo';
  }
  $('#main').innerHTML = head('Cadastros', 'O que vale para todos os eventos.') + `
    <div class="subtabs">${tabs.map(([k, l]) => `<button class="${sub === k ? 'active' : ''}" data-pref="cad" data-val="${k}">${l}</button>`).join('')}</div>
    <div class="card">${body || '<p class="empty">Nada cadastrado.</p>'}<div style="margin-top:12px"><button class="btn small light" data-act="${addAct}">+ Adicionar</button></div></div>`;
}

/* ---------- diálogos ---------- */
function openDialog(html, onOk, onDel) {
  const dlg = $('#dlg'), f = $('#dlg-form');
  f.innerHTML = html + `<div class="dlg-actions">${onDel ? '<button type="button" class="btn small danger left" id="dlg-del">Excluir</button>' : ''}<button class="btn ghost" value="cancel" formnovalidate>Cancelar</button><button class="btn" value="ok">Salvar</button></div>`;
  dlg.returnValue = ''; dlg.showModal();
  if (onDel) $('#dlg-del').onclick = () => { if (confirm('Excluir?')) { dlg.close(); onDel(); render(); } };
  dlg.onclose = () => { if (dlg.returnValue === 'ok') { onOk(new FormData(f)); render(); } };
}
function taskDialog(t) {
  const isNew = !t;
  t = t || { id: `${evId}_t${uid('m')}`, evento_id: evId, fase: '', tarefa: '', data: '', hora: '', status: 'Em aberto', origem: 'Manual', nota: '', excluido: '' };
  openDialog(`<h3>${isNew ? 'Nova tarefa' : 'Editar tarefa'}</h3>
    <div class="form-grid">
      <label class="f wide">Tarefa<input name="tarefa" required value="${esc(t.tarefa)}"></label>
      <label class="f">Fase<input name="fase" list="dl-fases2" value="${esc(t.fase)}"></label>
      <label class="f">Status<select name="status">${opts(L.tarefa, t.status)}</select></label>
      <label class="f">Data<input name="data" type="date" value="${esc(t.data)}"></label>
      <label class="f">Horário<input name="hora" type="time" value="${esc(t.hora)}"></label>
      <label class="f wide">Nota<textarea name="nota">${esc(t.nota)}</textarea></label>
    </div>${datalist('dl-fases2', L.fases)}
    ${t.origem === 'Produção' ? '<p class="mini">Tarefa do plano de produção: se gerar o plano de novo, o texto e o horário voltam ao que está na receita.</p>' : ''}`,
    d => { const tarefa = d.get('tarefa').trim(); if (!tarefa) return;
      save('Tarefas', [{ ...t, tarefa, fase: d.get('fase').trim(), status: d.get('status'), data: normDate(d.get('data')), hora: normTime(d.get('hora')), nota: d.get('nota') }]); },
    isNew ? null : () => save('Tarefas', [{ ...t, excluido: 'sim' }]));
}
function ingDialog(g) {
  openDialog(`<h3>${esc(g.nome)}: compra</h3>
    <p class="mini">Ex.: cebola roxa na receita em colher; 1 cebola dá 4 colheres → 1 colher = 0,25 cebola.</p>
    <div class="form-grid">
      <label class="f">Unidade na receita<select name="unidade">${opts(L.unidades, g.unidade, '—')}</select></label>
      <label class="f">Onde comprar<input name="onde" list="dl-onde2" value="${esc(g.onde_comprar)}"></label>
      <label class="f">1 unidade da receita = <input name="fator" inputmode="decimal" value="${esc(g.compra_fator)}" placeholder="0,25"></label>
      <label class="f">… desta unidade de compra<input name="cu" value="${esc(g.compra_unidade)}" placeholder="cebola, maço, pote, g"></label>
      <label class="chk wide"><input type="checkbox" name="arr" ${g.arredondar === 'sim' ? 'checked' : ''}> arredondar para cima (comprar inteiro)</label>
    </div>${datalist('dl-onde2', L.onde)}`,
    d => save('Ingredientes', [{ ...g, unidade: d.get('unidade'), onde_comprar: d.get('onde').trim(), compra_fator: d.get('fator').trim(), compra_unidade: d.get('cu').trim(), arredondar: d.get('arr') ? 'sim' : 'não' }]));
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
  'nova-bebida': () => { save('Bebidas', [{ id: uid(evId + '_b'), evento_id: evId, rotulo: 'Novo rótulo', modalidade: 'Consignado', excluido: '' }], true); render(); },
  'novo-custo': () => { save('Custos', [{ id: uid(evId + '_x'), evento_id: evId, descricao: '', categoria: '', valor: '', pago: 'não', excluido: '' }], true); render(); },
  'nova-pessoa': () => { save('Pessoas', [{ id: uid('p'), nome: 'Nova pessoa', excluido: '' }], true); render(); },
  'novo-fornecedor': () => { save('Fornecedores', [{ id: uid('f'), nome: 'Novo fornecedor', tipo: 'Vinícola', excluido: '' }], true); render(); },
  'novo-ingrediente': () => { save('Ingredientes', [{ id: uid('i'), nome: 'Novo ingrediente', unidade: 'colher', arredondar: 'não', onde_comprar: 'Mercado', excluido: '' }], true); render(); },
  'novo-modelo': () => { save('Modelo_Tarefas', [{ id: uid('m'), fase: '', tarefa: 'Nova tarefa', ref: 'D', desloc: '-7', nota: '', excluido: '' }], true); render(); },
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
  if ((el = d('[data-edit-task]'))) return taskDialog(byId('Tarefas', el.dataset.editTask));
  if ((el = d('[data-del]'))) { const [tab, id] = el.dataset.del.split('|'), r = byId(tab, id);
    if (r && confirm('Remover?')) { save(tab, [{ ...r, excluido: 'sim' }]); render(); } return; }
  if ((el = d('[data-pagou]'))) { const r = byId('Reservas', el.dataset.pagou), rs = reservas();
    if (rs.cap && rs.pagos.length >= rs.cap && !confirm(`Já são ${rs.pagos.length} pagos para ${rs.cap} lugares. Confirmar mesmo assim?`)) return;
    save('Reservas', [{ ...r, status: 'Pago', pagamento: today(), valor_pago: r.valor_pago || ev().valor_ingresso || '' }]); render(); return; }
  if ((el = d('[data-pick-rec]'))) { recSel = el.dataset.pickRec; render(); return; }
  if ((el = d('[data-open-rec]'))) { recSel = el.dataset.openRec; page = 'receitas'; render(); window.scrollTo({ top: 0 }); return; }
  if ((el = d('[data-ing-dlg]'))) return ingDialog(byId('Ingredientes', el.dataset.ingDlg));
  if ((el = d('[data-periodo]'))) { prefs.periodo = el.dataset.periodo; savePrefs(); render(); return; }
  if ((el = d('[data-pref]'))) { prefs[el.dataset.pref] = el.dataset.val; savePrefs(); render(); return; }
  if ((el = d('[data-act]')) && ACTIONS[el.dataset.act]) return ACTIONS[el.dataset.act](el);
  if (d('#sync') && MODE === 'n8n') { queue.length ? flush() : reload(); }
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
  $('#main').innerHTML = `<div class="card login accent"><h2>Painel Gato Véio</h2><p class="muted">Entre com a senha combinada no n8n.</p>
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
    $('#main').innerHTML = MODE === 'n8n' ? `<div class="card accent"><h3>Não consegui falar com o n8n</h3>
      <p class="mini">Erro: ${esc(e.message)} · endereço usado: <b>${esc(teste)}</b></p>
      <ol style="padding-left:18px;line-height:1.7">
        <li>Abra <a href="${esc(teste)}" target="_blank" rel="noopener">este link</a> numa aba nova.
          <br>• “not registered for GET” → o endereço está certo; o problema é no workflow (passo 3).
          <br>• “not registered” / página de erro → workflow <b>inativo</b> ou endereço errado no <b>config.js</b>.</li>
        <li>O endereço no config.js precisa começar com <b>https://</b>, terminar em <b>/webhook</b> (sem /gato-veio no final) e não pode ser o <i>webhook-test</i>.</li>
        <li>No n8n, abra <b>Executions</b> do workflow: se aparece uma execução vermelha, clique nela e veja qual nó falhou (geralmente credencial do Google ou ID da planilha).</li>
      </ol>
      <div class="toolbar"><button class="btn" onclick="location.reload()">Tentar de novo</button><button class="btn ghost" onclick="localStorage.removeItem('${K.senha}');location.reload()">Trocar senha</button></div></div>`
      : `<div class="notice bad"><b>Não consegui carregar os dados.</b><br>Abra o painel por um servidor (GitHub Pages ou servidor local), não direto do arquivo.<br><span class="mini">${esc(e.message)}</span></div>`;
    if (MODE !== "n8n") setSync(); return;
  }
  $('#tabs').style.display = '';
  evId = pickEvent(); render(); if (queue.length) flush();
}
start();
