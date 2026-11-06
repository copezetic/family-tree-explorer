/* Connects the tree data to the viewer. */
(() => {
  const toMap = list => Object.fromEntries((list || []).map(a => [a.k, a]));
  const A = toMap(window.TREE.ancestors), C = toMap((window.TREE.spouse || {}).ancestors);
  const gen = k => Math.floor(Math.log2(k));
  const kin = k => { const g = gen(k), base = k % 2 ? 'mother' : 'father';
    if (g === 1) return base; if (g === 2) return 'grand' + base; if (g === 3) return 'great-grand' + base;
    const n = g - 2, th = n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'; return n + th + ' great-grand' + base; };
  const famSide = (s, k) => { const g = gen(k); return g < 1 ? '' : ((k >> (g - 1)) === 2 ? 'father' : 'mother') + '\u2019s side'; };
  const sibs = a => (a.siblings || []).map(s => s.name.split(' ')[0] + (s.years ? ' (' + s.years + ')' : '')).join(', ');
  window.FAMILY = {};
  window.FAMILYAPP = { A, C, gen, kin, famSide, sibs, via: () => '', pics: () => [], credited: p => p, note: () => ({}), setMode: m => { document.body.dataset.mode = m; } };
})();
