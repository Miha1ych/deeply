'use strict';
// Palettes ported from the site's "Liquid Glass" CSS themes (+ the light "rug" theme).
// glows: [xFrac, yFrac, radiusFrac, 'rgba(...)'] like CSS radial-gradient(circle at X Y, colour, transparent R)
const THEMES = [
  {
    id: 'emerald', name: 'Изумруд',
    pageTop: '#0B2019', pageMid: '#06130F', pageEnd: '#030806', midStop: 52,
    glows: [[18, 8, 34, 'rgba(67,197,158,.22)'], [82, 18, 30, 'rgba(255,255,255,.035)']],
    accent: '#43C59E', accent2: '#91E7C7', ink: '#06110D',
    border: '#285344', surface: '#0D1D17', surfaceHover: '#19382D', selected: '#122A21',
    text: '#E9FFF7', muted: '#9DB9AF', tint: '7,18,14'
  },
  {
    id: 'glass', name: 'Стекло',
    pageTop: '#07100B', pageMid: '#09130D', pageEnd: '#060B08', midStop: 45,
    glows: [[15, 10, 32, 'rgba(50,220,120,.16)'], [85, 15, 30, 'rgba(20,180,90,.12)'], [50, 80, 38, 'rgba(30,150,80,.10)']],
    accent: '#E1E6F0', accent2: '#F7F7F7', ink: '#0B0F0C',
    border: '#2E3531', surface: '#151A17', surfaceHover: '#252B28', selected: '#1D2320',
    text: '#E6E8E7', muted: '#8C918E', tint: '11,16,13'
  },
  {
    id: 'arctic', name: 'Арктика',
    pageTop: '#101D29', pageMid: '#081018', pageEnd: '#04070A', midStop: 52,
    glows: [[18, 8, 34, 'rgba(115,199,255,.22)'], [82, 18, 30, 'rgba(255,255,255,.045)']],
    accent: '#73C7FF', accent2: '#B9E7FF', ink: '#061018',
    border: '#315064', surface: '#101B26', surfaceHover: '#1E3444', selected: '#172737',
    text: '#EEF9FF', muted: '#A4BBC8', tint: '8,15,22'
  },
  {
    id: 'obsidian', name: 'Обсидиан',
    pageTop: '#171020', pageMid: '#0E0B14', pageEnd: '#05070A', midStop: 52,
    glows: [[18, 8, 34, 'rgba(155,124,255,.22)'], [82, 18, 30, 'rgba(255,255,255,.035)']],
    accent: '#9B7CFF', accent2: '#C4B5FD', ink: '#090A0D',
    border: '#403455', surface: '#17121F', surfaceHover: '#292036', selected: '#20172B',
    text: '#F2EEFF', muted: '#AAA0BC', tint: '10,10,16'
  },
  {
    id: 'peach', name: 'Персик',
    pageTop: '#211A19', pageMid: '#251D1C', pageEnd: '#171110', midStop: 45,
    glows: [[15, 10, 32, 'rgba(217,143,125,.16)'], [85, 18, 30, 'rgba(232,176,161,.11)'], [50, 85, 38, 'rgba(190,105,90,.09)']],
    accent: '#D98F7D', accent2: '#E8B0A1', ink: '#241817',
    border: '#4A3834', surface: '#1C1413', surfaceHover: '#3A2A27', selected: '#2B211F',
    text: '#F3E8E4', muted: '#9C8C87', tint: '27,20,19'
  },
  {
    id: 'wine', name: 'Вино',
    pageTop: '#241016', pageMid: '#160A0E', pageEnd: '#05070A', midStop: 52,
    glows: [[18, 8, 34, 'rgba(184,92,114,.22)'], [82, 18, 30, 'rgba(255,255,255,.035)']],
    accent: '#B85C72', accent2: '#E39AA9', ink: '#12080C',
    border: '#59313D', surface: '#211017', surfaceHover: '#3A1D28', selected: '#301720',
    text: '#F8EDEF', muted: '#BFA6AD', tint: '16,8,12'
  },
  {
    id: 'rug', name: 'Ковёр', light: true, backdrop: 'rug',
    pageTop: '#5A2A1F', pageMid: '#3E1F17', pageEnd: '#1E120D', midStop: 52,
    glows: [[18, 8, 34, 'rgba(232,160,120,.16)'], [82, 20, 30, 'rgba(255,243,224,.05)']],
    accent: '#B85A3E', accent2: '#D98B6A', ink: '#FFF7EE',
    border: '#D6C6AE', surface: '#F4ECDF', surfaceHover: '#EADCC6', selected: '#E9DBC3',
    text: '#2E2520', muted: '#8C7A6B', tint: '242,233,219',
    tile2: '#CDD3B8', shortA: '#7E9A6B', shortB: '#A7B98F', longA: '#B08A4A', longB: '#D0B27A'
  }
];

function themeById(id) { return THEMES.find(t => t.id === id) || THEMES[0]; }

// focus / break colours for the ring, tabs and start button
function phaseColors(theme, phase) {
  if (phase === 'short') return [theme.shortA || '#43B4C5', theme.shortB || '#91DEE7'];
  if (phase === 'long') return [theme.longA || '#6C93E6', theme.longB || '#AFC8F5'];
  return [theme.accent, theme.accent2];
}
