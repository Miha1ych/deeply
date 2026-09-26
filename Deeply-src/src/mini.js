'use strict';
const api = window.deeply;
const $ = id => document.getElementById(id);
const C = 2 * Math.PI * 27;
const prog = $('prog');
prog.style.strokeDasharray = C.toFixed(2);

$('skip').innerHTML = icon('skip', 16);
$('expand').innerHTML = icon('expand', 16);
$('hide').innerHTML = icon('minimize', 16);

$('play').onclick = () => api.miniCmd('toggle');
$('skip').onclick = () => api.miniCmd('skip');
$('expand').onclick = () => api.miniCmd('expand');
$('hide').onclick = () => api.miniCmd('hide');
$('mplay').onclick = () => api.miniCmd('music');
$('vol').oninput = e => { e.target.style.setProperty('--val', e.target.value + '%'); api.miniCmd('volume', +e.target.value); };
document.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); api.miniCmd('toggle'); } });

let last = {}, height = 0;
api.on('state', s => {
  const root = document.documentElement.style;
  root.setProperty('--a', s.colors[0]); root.setProperty('--b', s.colors[1]);
  root.setProperty('--text', s.theme.text); root.setProperty('--muted', s.theme.muted); root.setProperty('--tint', s.theme.tint);
  document.body.classList.toggle('light', s.theme.light);
  $('ga').setAttribute('stop-color', s.colors[0]); $('gb').setAttribute('stop-color', s.colors[1]);
  $('time').textContent = s.time;
  prog.style.strokeDashoffset = (C * s.elapsed).toFixed(2);   // the arc shrinks as time passes
  $('sub').innerHTML = `<b></b>${s.task ? ' · <span></span>' : ''}`;
  $('sub').querySelector('b').textContent = s.phase;
  if (s.task) $('sub').querySelector('span').textContent = s.task;
  if (last.running !== s.running) $('play').innerHTML = icon(s.running ? 'pause' : 'play', 20);
  const m = s.music;
  document.body.classList.toggle('has-music', m.configured);
  if (last.mplaying !== m.playing) $('mplay').innerHTML = icon(m.playing ? 'pause' : 'music', 16);
  $('mtitle').textContent = m.title;
  const vol = $('vol');
  if (document.activeElement !== vol) { vol.value = m.volume; vol.style.setProperty('--val', m.volume + '%'); }
  last = { running: s.running, mplaying: m.playing };
  const h = m.configured ? 136 : 86;
  if (h !== height) { height = h; api.miniResize(h); }
  document.body.classList.add('ready');
});
api.miniCmd('mini-ready');
