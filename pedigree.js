/* The family tree view: a classic pedigree, one person on the left and their ancestors branching
   out to the right, but easier to get around in. Search finds anyone in either tree by name or place; the trail along
   the top is the line back to the starting person, one tap per generation; a tap on a card opens that person's story,
   photographs and family, and a second tap (or "Centre the tree here") makes them the starting point. Drag, pinch or
   scroll to move; on the TV remote the arrows walk the cards and OK opens them. Data comes through window.FAMILYAPP. */
(() => {
  const F = window.FAMILYAPP, D = window.FAMILY || {}, $ = id => document.getElementById(id);
  if (!F || !$('ped')) return;
  const T = { h: F.A, c: F.C || {} }, ROOT = { h: 'Alex', c: 'Sam' };
  const TOUCH = matchMedia('(pointer: coarse)').matches;
  const gen = F.gen, LINE = ['#c9a85f', '#9fbf9f', '#8fa6c9', '#c99a86'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const first = n => (n || '').replace(/^(Rev\.?|Sergeant|Sgt\.?|Colonel|Col\.?|Deacon|Capt\.?|Captain|Lt\.?|Dr\.?|Ens\.?)\s+/i, '').split(/\s+/)[0];
  const yearOf = a => ((a.born || {}).date || a.years || '').match(/\d{4}/);

  // --- what we know about a person -----------------------------------------------------------------------------
  const photosOf = (s, k) => { const a = T[s][k]; if (!a) return [];
    const own = (s === 'h' && D.stories && D.stories[k] && D.stories[k].photos) || [];
    return [...own.map(F.credited), ...F.pics(a)].filter((x, j, all) => all.findIndex(y => y.src === x.src) === j); };
  const face = (s, k) => (photosOf(s, k).find(p => !/\/era\//.test(p.src)) || {}).src;
  const storyOf = (s, k) => (s === 'h' && D.stories && D.stories[k] && D.stories[k].story) || F.note(T[s][k]).story || '';
  const roleOf = (s, k) => (s === 'h' && D.stories && D.stories[k] && D.stories[k].role) || F.note(T[s][k]).role || '';
  const relOf = (s, k) => k === 1 ? 'Where this tree starts' : `${ROOT[s]}'s ${F.kin(k)}`;
  const colour = k => { const g = gen(k); return g < 2 ? '#d8c690' : LINE[(k >> (g - 2)) - 4]; };
  const initials = n => { const w = (n || '').replace(/["“”].*?["“”]|\(.*?\)/g, '').split(/\s+/).filter(Boolean); return ((w[0] || '')[0] || '') + (w.length > 1 ? w[w.length - 1][0] : ''); };
  const isAnc = (k, of) => { while (k > of) k >>= 1; return k === of; };

  // --- search: everyone in both trees, by name, years or place -------------------------------------------------
  const IDX = [];
  for (const s of ['h', 'c']) for (const [k, a] of Object.entries(T[s])) if (a && a.name)
    IDX.push({ s, k: +k, a, n: norm(a.name), t: norm([a.name, a.years, (a.born || {}).place, (a.died || {}).place].join(' ')) });
  function find(q) {
    const toks = norm(q).split(/\s+/).filter(Boolean); if (!toks.length) return [];
    // a name that starts with what was typed beats one that contains it, which beats a match on a place or a year
    const score = x => toks.reduce((n, t) => n + (x.n.split(/\s+/).some(w => w.startsWith(t)) ? 3 : x.n.includes(t) ? 2 : 1), 0);
    return IDX.filter(x => toks.every(t => x.t.includes(t)))
      .map(x => ({ ...x, sc: score(x) }))
      .sort((x, y) => (y.sc - x.sc) || ((x.s === side ? 0 : 1) - (y.s === side ? 0 : 1)) || (gen(x.k) - gen(y.k)))
      .slice(0, 12);
  }

  // --- state and layout --------------------------------------------------------------------------------------------
  let on = false, side = 'h', focus = 1, G = 4, sel = 0, cur = 1, geo = null, view = { x: 0, y: 0, s: 1 }, pi = 0, hits = [], hit = 0;
  const world = $('pWorld'), stage = $('pStage'), ped = $('ped');
  const phone = () => stage.clientWidth < 700;
  const defaultG = () => phone() ? 3 : stage.clientHeight < 1100 ? 4 : 5;   // four reads well across the room on the TV

  function render(dir) {
    const M = T[side], W = stage.clientWidth, H = stage.clientHeight, ph = W < 700;
    const pad = ph ? 12 : 36, gap = ph ? 16 : 46, left = ph ? 0 : 40, right = ph ? 0 : 40;
    // a phone keeps the cards wide enough to read and lets the chart run off to the right: swipe to go further back
    const cw = ph ? Math.min(168, Math.round(W * .4)) : Math.round(Math.max(168, Math.min(250, (W - 2 * pad - left - right - (G - 1) * gap) / G)));
    const ch = ph ? 62 : 64, slot = ch + (ph ? 20 : 16), WW = 2 * pad + left + right + G * cw + (G - 1) * gap, WH = 2 ** (G - 1) * slot + 2 * pad;
    const pos = {}, lines = [];
    for (let d = 0; d < G; d++) for (let i = 0; i < 2 ** d; i++) {
      const k = focus * 2 ** d + i, x = pad + left + d * (cw + gap), y = pad + (i + .5) * 2 ** (G - 1 - d) * slot, c = k >> 1;
      if (M[k]) pos[k] = { x, y, d };
      else if (d && pos[c] && !pos[c].empty) pos[k] = { x, y, d, empty: true };   // a missing parent of someone we know
      else continue;
      if (d) lines.push([c, k]);
    }
    const card = (k, p) => {
      const box = `left:${p.x}px;top:${p.y - ch / 2}px;width:${cw}px;height:${ch}px;--d:${p.d}`;
      if (p.empty) return `<div class="pc empty" style="${box}"><span class="pt"><b>${k % 2 ? 'Mother' : 'Father'}</b><small>not yet found</small></span></div>`;
      const a = M[k], f = face(side, k), more = p.d === G - 1 && (M[2 * k] || M[2 * k + 1]);
      return `<div class="pc${k === focus ? ' root' : ''}${k === sel ? ' sel' : ''}${k === cur ? ' cur' : ''}${more ? ' more' : ''}" data-k="${k}" style="${box};--lc:${colour(k)}">` +
        `<i${f ? ` style="background-image:url('${f}')"` : ''}>${f ? '' : esc(initials(a.name))}</i><span class="pt"><b>${esc(a.name)}</b><small>${esc(a.years || '')}</small></span>` +
        (more ? `<button class="pmore" data-go="${k}" aria-label="${esc(first(a.name))}'s parents">›</button>` : '') +
        (k === focus && k > 1 && !ph ? `<button class="pback" data-go="${k >> 1}" aria-label="Back a generation">‹</button>` : '') + `</div>`;
    };
    const path = ([c, k]) => { const a = pos[c], b = pos[k], x1 = a.x + cw, xm = x1 + gap / 2;
      return `<path data-k="${k}" class="${b.empty ? 'dash' : ''}" d="M${x1} ${a.y} H${xm} V${b.y} H${b.x}"/>`; };
    world.style.setProperty('--dx', dir > 0 ? '28px' : dir < 0 ? '-28px' : '0px');
    world.style.width = WW + 'px'; world.style.height = WH + 'px';
    world.innerHTML = `<svg width="${WW}" height="${WH}" aria-hidden="true">${lines.map(path).join('')}</svg>` + Object.keys(pos).map(k => card(+k, pos[k])).join('');
    geo = { pos, cw, ch, WW, WH, W, H };
    lit(); trail(); legend();
    ped.querySelectorAll('#pSide button').forEach(b => b.classList.toggle('on', b.dataset.s === side));
    ped.querySelectorAll('#pGens button').forEach(b => b.classList.toggle('on', +b.dataset.g === G));
    $('pGen').textContent = G;
    try { history.replaceState(null, '', location.pathname + '?ped=' + side + (sel || focus)); } catch (e) {}
  }
  // the line from the starting card to the one that's open is drawn in brass
  function lit() {
    const on_ = new Set(); if (sel && isAnc(sel, focus)) for (let k = sel; k > focus; k >>= 1) on_.add(k);
    world.querySelectorAll('path').forEach(p => p.classList.toggle('on', on_.has(+p.dataset.k)));
    world.querySelectorAll('.pc[data-k]').forEach(c => { const k = +c.dataset.k; c.classList.toggle('sel', k === sel); c.classList.toggle('cur', k === cur && !TOUCH); });
  }
  function trail() {
    const ks = []; for (let k = focus; k >= 1; k >>= 1) ks.unshift(k);
    const M = T[side];
    $('pTrail').innerHTML = (ks.length > 1 ? ks.map((k, j) => `${j ? '<span>›</span>' : ''}<button data-go="${k}"${k === focus ? ' class="here"' : ''}>${esc(k === focus ? M[k].name : first(M[k].name))}<small>${esc((yearOf(M[k]) || [''])[0])}</small></button>`).join('')
      : `<em>${TOUCH ? 'Tap anyone for their story · swipe for more generations' : 'Click anyone for their story · double-click to start the tree from them'}</em>`);
    const t = $('pTrail'); t.scrollLeft = t.scrollWidth;
  }
  function legend() {
    const M = T[side];
    $('pLegend').innerHTML = [4, 5, 6, 7].filter(q => M[q]).map(q => `<span><i style="background:${LINE[q - 4]}"></i>${esc([M[2 * q], M[2 * q + 1]].filter(Boolean).map(a => a.surname || a.name.split(' ').pop()).join(' · ') || M[q].surname || '')}</span>`).join('');
  }

  // --- moving the view -----------------------------------------------------------------------------------------------
  function setView(v, anim) { view = v; world.classList.toggle('drag', !anim); world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.s})`; }
  function fit(anim) {
    const { WW, WH, W, H } = geo, ph = W < 700;
    const s = ph ? 1 : Math.max(.6, Math.min(W / WW, H / WH, 1.15));
    const x = WW * s <= W ? (W - WW * s) / 2 : 0, y = WH * s <= H ? (H - WH * s) / 2 : H / 2 - (geo.pos[focus] ? geo.pos[focus].y : WH / 2) * s;
    setView({ x, y, s }, anim);
  }
  const clampS = s => Math.max(.3, Math.min(2.5, s));
  function zoomAt(mx, my, f, anim) { const s = clampS(view.s * f), wx = (mx - view.x) / view.s, wy = (my - view.y) / view.s; setView({ s, x: mx - wx * s, y: my - wy * s }, anim); }
  // keep a card clear of the panel (beside it on a wide screen, under it on a phone)
  function ensureVisible(k) {
    const p = geo.pos[k]; if (!p) return;
    const open = ped.classList.contains('panel'), pw = open && !phone() ? Math.min(430, stage.clientWidth * .92) : 0, sh = open && phone() ? stage.clientHeight * .62 : 0;
    const W = stage.clientWidth - pw, H = stage.clientHeight - sh, m = 16;
    const x0 = view.x + p.x * view.s, x1 = x0 + geo.cw * view.s, y0 = view.y + (p.y - geo.ch / 2) * view.s, y1 = y0 + geo.ch * view.s;
    let dx = 0, dy = 0;
    if (x1 > W - m) dx = W - m - x1; if (x0 + dx < m) dx = m - x0;
    if (y1 > H - m) dy = H - m - y1; if (y0 + dy < m) dy = m - y0;
    if (dx || dy) setView({ ...view, x: view.x + dx, y: view.y + dy }, true);
  }

  // --- choosing people -------------------------------------------------------------------------------------------------
  function centre(k) {
    if (!T[side][k]) return;
    const dir = k === focus ? 0 : isAnc(k, focus) ? 1 : -1; focus = k; render(dir);
    if (!geo.pos[cur] || geo.pos[cur].empty) cur = k;
    if (sel && (!geo.pos[sel] || geo.pos[sel].empty)) closePanel();
    lit(); fit(true); if (sel) setTimeout(() => ensureVisible(sel), 600);
  }
  function select(k) {
    sel = k; cur = k; lit(); panel(k); ped.classList.add('panel');
    try { history.replaceState(null, '', location.pathname + '?ped=' + side + k); } catch (e) {}
    setTimeout(() => ensureVisible(k), 60);
  }
  // show someone from anywhere (search, a family chip): keep the chart if they are on it, else start it from their child
  function reveal(s, k) {
    if (!T[s][k]) return;
    if (s === side && geo && geo.pos[k] && !geo.pos[k].empty) { select(k); return; }
    side = s; focus = k > 1 ? k >> 1 : 1; cur = k; sel = k; render(1); fit(true); select(k);
  }
  function closePanel() { ped.classList.remove('panel'); sel = 0; lit(); }

  // --- the person panel ----------------------------------------------------------------------------------------------
  function panel(k) {
    const M = T[side], a = M[k]; if (!a) return;
    const ph = photosOf(side, k); pi = 0;
    const svc = (F.SV ? F.SV(side) : []).filter(x => x.k === k);
    const sp = k === 1 ? (side === 'h' ? (F.C && F.C[1] ? ['c', 1] : null) : ['h', 1]) : (M[k ^ 1] ? [side, k ^ 1] : null);
    const chip = (s, kk, label) => { const p = T[s][kk]; if (!p) return ''; const f = face(s, kk);
      return `<button class="pchip" data-s="${s}" data-k="${kk}"><i${f ? ` style="background-image:url('${f}')"` : ''}>${f ? '' : esc(initials(p.name))}</i><span><b>${esc(p.name)}</b><small>${label}${p.years ? ' · ' + esc(p.years) : ''}</small></span></button>`; };
    const ev = (l, e) => e && (e.date || e.place) ? `<div><span>${l}</span>${esc([(e.date || '').replace(/\.\.+/g, '.'), e.place].filter(Boolean).join(', '))}</div>` : '';
    const kid = k > 1 ? M[k >> 1] : null, story = storyOf(side, k), role = roleOf(side, k);
    const fam = [chip(side, 2 * k, 'father'), chip(side, 2 * k + 1, 'mother'), sp ? chip(sp[0], sp[1], a.sex === 'F' ? 'husband' : 'wife') : '',
      kid ? chip(side, k >> 1, kid.sex === 'F' ? 'daughter' : 'son') : ''].join('');
    $('pPanel').innerHTML = `<button class="px" id="pClose" aria-label="Close">×</button>` +
      (ph.length ? `<figure class="pphoto"><div class="pimg"><img id="pImg" src="${ph[0].src}" alt=""></div><figcaption id="pCap">${ph[0].cap}</figcaption>` +
        (ph.length > 1 ? `<div class="pnav"><button data-ph="-1" aria-label="Previous photo">‹</button><span id="pCount">1 / ${ph.length}</span><button data-ph="1" aria-label="Next photo">›</button></div>` : '') + `</figure>` : '') +
      `<p class="kick">${esc(relOf(side, k))}</p>${F.via(side, k) ? `<p class="pvia">${esc(F.via(side, k))}</p>` : ''}<h2>${esc(a.name)}</h2>` + (role ? `<p class="prole">${esc(role)}</p>` : '') +
      `<div class="pmeta">${a.living ? (yearOf(a) ? `<div><span>born</span>${yearOf(a)[0]}</div>` : '') : ev('born', a.born) + ev('died', a.died) + (a.buried ? `<div><span>buried</span>${esc(a.buried)}</div>` : '') + (k > 1 || side === 'c' ? ev('married', a.married) : '')}</div>` +
      (story ? `<p class="pstory">${story}</p>` : '') +
      svc.map(x => `<div class="psvc"><b>${esc(x.war)} · ${esc(x.when)}</b><span>${esc(x.rank)}${x.unit ? ' — ' + esc(x.unit) : ''}</span><p>${x.did}</p></div>`).join('') +
      (fam ? `<h3>Family</h3><div class="pchips">${fam}</div>` : '') +
      (!M[2 * k] && !M[2 * k + 1] && !a.living ? `<p class="pnone">Parents not yet found.</p>` : '') +
      ((a.siblings || []).length ? `<h3>Brothers and sisters</h3><p class="psibs">${F.sibs(a)}</p>` : '') +
      (k !== focus ? `<button class="pcta" id="pCentre">Start the tree from ${esc(first(a.name))} ›</button>` : '');
    $('pPanel').scrollTop = 0;
    $('pClose').onclick = closePanel;
    if ($('pCentre')) $('pCentre').onclick = () => centre(k);
    $('pPanel').querySelectorAll('[data-ph]').forEach(b => b.onclick = () => { pi = (pi + +b.dataset.ph + ph.length) % ph.length;
      $('pImg').src = ph[pi].src; $('pCap').innerHTML = ph[pi].cap; $('pCount').textContent = `${pi + 1} / ${ph.length}`; });
    $('pPanel').querySelectorAll('.pchip').forEach(b => b.onclick = () => reveal(b.dataset.s, +b.dataset.k));
  }

  // --- pointer: drag to move, pinch or ctrl-scroll to zoom, tap a card, tap twice to start from it ------------------
  const pts = new Map(); let start = null, pinch = null, moved = false, lastTap = { k: 0, t: 0 };
  stage.addEventListener('pointerdown', e => {
    ped.classList.remove('keys');
    if (e.button > 0 || e.target.closest('button')) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { start = { v: { ...view }, p: [e.clientX, e.clientY], card: e.target.closest('.pc[data-k]') }; moved = false; }
    else if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { v: { ...view }, d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; moved = true; }
  });
  addEventListener('pointermove', e => {
    if (!on || !pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    const r = stage.getBoundingClientRect();
    if (pts.size >= 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const s = clampS(pinch.v.s * d / pinch.d), wx = (pinch.m[0] - r.left - pinch.v.x) / pinch.v.s, wy = (pinch.m[1] - r.top - pinch.v.y) / pinch.v.s;
      setView({ s, x: m[0] - r.left - wx * s, y: m[1] - r.top - wy * s }); return; }
    if (start) { const dx = e.clientX - start.p[0], dy = e.clientY - start.p[1]; if (!moved && Math.hypot(dx, dy) < 7) return;
      moved = true; stage.classList.add('grabbing'); setView({ s: start.v.s, x: start.v.x + dx, y: start.v.y + dy }); }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 1) { start = { v: { ...view }, p: [...pts.values()][0], card: null }; return; }
    stage.classList.remove('grabbing');
    if (!moved && start && start.card && e.type === 'pointerup') {
      const k = +start.card.dataset.k, now = performance.now();
      if (lastTap.k === k && now - lastTap.t < 380) { lastTap = { k: 0, t: 0 }; centre(k); } else { lastTap = { k, t: now }; select(k); }
    }
    start = null;
  };
  addEventListener('pointerup', up); addEventListener('pointercancel', up);
  stage.addEventListener('wheel', e => { e.preventDefault(); const r = stage.getBoundingClientRect();
    if (e.ctrlKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * .012)); else setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY }); }, { passive: false });
  world.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { e.stopPropagation(); centre(+b.dataset.go); } });

  // --- toolbar ----------------------------------------------------------------------------------------------------------
  ped.querySelectorAll('#pSide button').forEach(b => b.onclick = () => { if (b.dataset.s === side) return; side = b.dataset.s; focus = 1; cur = 1; closePanel(); render(0); fit(true); });
  ped.querySelectorAll('#pGens button').forEach(b => b.onclick = () => { G = +b.dataset.g; render(0); fit(true); });
  $('pGen').onclick = () => { G = G >= 5 ? 3 : G + 1; render(0); fit(true); };
  $('pHome').onclick = () => { focus = 1; cur = 1; closePanel(); render(-1); fit(true); };
  $('pIn').onclick = () => zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, 1.25, true);
  $('pOut').onclick = () => zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, .8, true);
  $('pFit').onclick = () => fit(true);
  $('pMenu').onclick = () => window.FAMILYMENU && window.FAMILYMENU();
  $('pTrail').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) centre(+b.dataset.go); });
  // search
  const box = $('pFind'), list = $('pHits');
  const drawHits = () => {
    list.hidden = !hits.length && !box.value.trim();
    list.innerHTML = hits.length ? hits.map((x, j) => `<li data-j="${j}"${j === hit ? ' class="on"' : ''}><b>${esc(x.a.name)}</b><small>${esc(x.a.years || '')}${x.a.years ? ' · ' : ''}${esc(relOf(x.s, x.k))}${x.k > 3 ? ' (' + esc(F.famSide(x.s, x.k)) + ')' : ''}${(x.a.born || {}).place ? ' · ' + esc(x.a.born.place.split(',')[0]) : ''}</small></li>`).join('')
      : `<li class="none">No one by that name yet.</li>`;
  };
  box.addEventListener('input', () => { hits = find(box.value); hit = 0; drawHits(); });
  box.addEventListener('focus', () => { if (box.value.trim()) drawHits(); });
  box.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 180));
  const pick = j => { const x = hits[j]; if (!x) return; list.hidden = true; box.value = ''; hits = []; box.blur(); reveal(x.s, x.k); };
  list.addEventListener('pointerdown', e => { const li = e.target.closest('li[data-j]'); if (li) { e.preventDefault(); pick(+li.dataset.j); } });

  // --- keys: the TV remote and a keyboard ---------------------------------------------------------------------------------
  addEventListener('keydown', e => {
    if (!on) return;
    if (e.target === box) {   // typing in the search box: nothing else should react
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hit = Math.max(0, Math.min(hits.length - 1, hit + (e.key === 'ArrowDown' ? 1 : -1))); drawHits(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(hit); }
      else if (e.key === 'Escape') { e.preventDefault(); box.value = ''; hits = []; list.hidden = true; box.blur(); }
      e.stopImmediatePropagation(); return;
    }
    const M = T[side], panelOpen = ped.classList.contains('panel');
    let to = 0;
    if (e.key === 'ArrowRight') to = M[2 * cur] ? 2 * cur : M[2 * cur + 1] ? 2 * cur + 1 : 0;
    else if (e.key === 'ArrowLeft') to = cur > 1 ? cur >> 1 : 0;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {   // the next card up or down the same column
      const d = gen(cur), col = Object.keys(geo.pos).map(Number).filter(k => gen(k) === d && !geo.pos[k].empty).sort((x, y) => geo.pos[x].y - geo.pos[y].y);
      to = col[col.indexOf(cur) + (e.key === 'ArrowDown' ? 1 : -1)] || 0;
    }
    else if (e.key === 'Enter' || e.key === ' ') { if (panelOpen && sel === cur) centre(cur); else select(cur); }
    else if ((e.key === 'Escape' || e.key === 'Backspace') && panelOpen) closePanel();
    else if (e.key === '/' || (e.key.length === 1 && /[a-z]/i.test(e.key) && !e.metaKey && !e.ctrlKey && e.key !== 'm')) { box.focus(); return; }
    else return;   // Back with no panel open goes on to walk.js, which returns to the menu
    e.preventDefault(); e.stopImmediatePropagation(); ped.classList.add('keys');
    if (!to) return;
    if (!geo.pos[to] || geo.pos[to].empty) { if (to < focus) centre(to); else centre(cur); }   // off the chart: move the chart
    cur = to; lit(); ensureVisible(to);
    if (panelOpen) select(to);
  }, true);
  // only a change of width needs a new layout: iPhone Safari resizes the height whenever its address bar slides
  let lastW = 0;
  addEventListener('resize', () => { if (!on || stage.clientWidth === lastW) return; lastW = stage.clientWidth; render(0); fit(false); if (sel) ensureVisible(sel); });

  window.FAMILYPED = {
    open(s, k) {
      on = true; side = s === 'c' && F.C && F.C[1] ? 'c' : 'h'; ped.classList.add('on'); F.setMode('ped');
      G = defaultG(); focus = 1; cur = 1; sel = 0; ped.classList.remove('panel'); lastW = stage.clientWidth;
      render(0); fit(false);
      if (k && k !== 1 && T[side][k]) reveal(side, k);
      // on a fresh page load the screen size can still be settling: measure again next frame
      requestAnimationFrame(() => { if (!on) return; const g = defaultG(); if (g !== G) { G = g; render(0); } fit(false); lastW = stage.clientWidth; if (sel) ensureVisible(sel); });
    },
    close() { if (!on) return; on = false; ped.classList.remove('on', 'panel'); try { history.replaceState(null, '', location.pathname); } catch (e) {} },
  };
})();
