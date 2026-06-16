'use strict';

console.log('Lucky Tap v10.0 loaded - ' + new Date().toISOString());

// ==================== STORAGE ====================
var GAME_KEYS = ['ltCoins','ltBet','ltHistory','ltWins','ltBiggest','ltBestStreak','ltPlays','ltPeak','ltLastDaily','ltLastWheel','ltLastVisit'];
var canSave = localStorage.getItem('luckyTapConsent') === 'true';
var cookieBanner = document.getElementById('cookieBanner');

if (!localStorage.getItem('luckyTapConsent')) {
  setTimeout(function() { cookieBanner.classList.add('visible'); }, 500);
}

document.getElementById('cookieAccept').addEventListener('click', function() {
  localStorage.setItem('luckyTapConsent', 'true');
  canSave = true;
  cookieBanner.classList.remove('visible');
  saveState();
});

document.getElementById('cookieDecline').addEventListener('click', function() {
  localStorage.setItem('luckyTapConsent', 'false');
  canSave = false;
  cookieBanner.classList.remove('visible');
});

// ==================== GAME STATE ====================
var coins = canSave ? (parseInt(localStorage.getItem('ltCoins'), 10) || 1000) : 1000;
var bet = canSave ? (parseInt(localStorage.getItem('ltBet'), 10) || 50) : 50;
var streak = 0;
var lossStreak = 0;
var isFlipping = false;
var gameHistory = [];
var totalWins = canSave ? (parseInt(localStorage.getItem('ltWins'), 10) || 0) : 0;
var biggestWin = canSave ? (parseInt(localStorage.getItem('ltBiggest'), 10) || 0) : 0;
var bestStreak = canSave ? (parseInt(localStorage.getItem('ltBestStreak'), 10) || 0) : 0;
var totalPlays = canSave ? (parseInt(localStorage.getItem('ltPlays'), 10) || 0) : 0;
var peakBalance = canSave ? (parseInt(localStorage.getItem('ltPeak'), 10) || 1000) : 1000;
var lastDaily = canSave ? (parseInt(localStorage.getItem('ltLastDaily'), 10) || 0) : 0;
var lastWheel = canSave ? (parseInt(localStorage.getItem('ltLastWheel'), 10) || 0) : 0;
var lastVisit = canSave ? (parseInt(localStorage.getItem('ltLastVisit'), 10) || Date.now()) : Date.now();
var luckyHourEnd = 0;
var idleCoinsEarned = 0;

var inRecoveryMode = false;
var recoveryWinsNeeded = 4;
var recoveryWinsCount = 0;

try {
  var saved = localStorage.getItem('ltHistory');
  if (canSave && saved) { gameHistory = JSON.parse(saved) || []; }
} catch (e) { gameHistory = []; }

var baseMultipliers = [0, 0, 0, 0, 0.5, 0.5, 1.5, 2, 2, 3, 5, 10];
var wheelPrizes = [50, 100, 250, 500, 25, 1000, 200, 150];
var wheelWeights = [5, 4, 2, 1.5, 6, 1, 3, 3];

function getWeightedPrizeIndex() {
  var totalWeight = 0;
  for (var i = 0; i < wheelWeights.length; i++) totalWeight += wheelWeights[i];
  var random = Math.random() * totalWeight;
  var cumulative = 0;
  for (var i = 0; i < wheelWeights.length; i++) {
    cumulative += wheelWeights[i];
    if (random < cumulative) return i;
  }
  return 0;
}

function positionWheelLabels() {
  var labels = document.querySelectorAll('.wheel-label');
  var center = 123, radius = 83;
  labels.forEach(function(label, i) {
    var angle = (i * 45 + 22.5) * (Math.PI / 180);
    var x = center + Math.sin(angle) * radius - 15;
    var y = center - Math.cos(angle) * radius - 8;
    label.style.left = x + 'px';
    label.style.top = y + 'px';
    label.textContent = wheelPrizes[i];
  });
}
setTimeout(positionWheelLabels, 100);

// ==================== DOM ELEMENTS ====================
var coinDisplay = document.getElementById('coinDisplay');
var coinAmountEl = document.getElementById('coinAmount');
var betAmountEl = document.getElementById('betAmount');
var tapButton = document.getElementById('tapButton');
var tapContent = document.getElementById('tapContent');
var rollingText = document.getElementById('rollingText');
var resultContainer = document.getElementById('resultContainer');
var resultEmoji = document.getElementById('resultEmoji');
var resultText = document.getElementById('resultText');
var multiplierText = document.getElementById('multiplierText');
var streakEl = document.getElementById('streak');
var streakCountEl = document.getElementById('streakCount');
var historySection = document.getElementById('historySection');
var historyList = document.getElementById('historyList');
var resetBtn = document.getElementById('resetBtn');
var totalWinsEl = document.getElementById('totalWins');
var biggestWinEl = document.getElementById('biggestWin');
var bestStreakEl = document.getElementById('bestStreak');
var totalPlaysEl = document.getElementById('totalPlays');
var peakBalanceEl = document.getElementById('peakBalance');
var recoveryIndicator = document.getElementById('recoveryIndicator');
var recoveryProgressEl = document.getElementById('recoveryProgress');
var peakCelebration = document.getElementById('peakCelebration');
var peakCelebrationAmount = document.getElementById('peakCelebrationAmount');
var peakChase = document.getElementById('peakChase');
var peakChaseAmount = document.getElementById('peakChaseAmount');
var tierDisplay = document.getElementById('tierDisplay');
var tierIconEl = document.getElementById('tierIcon');
var tierNameEl = document.getElementById('tierName');
var tierProgressFill = document.getElementById('tierProgressFill');
var tierProgressText = document.getElementById('tierProgressText');
var oddsText = document.getElementById('oddsText');
var luckyMultEl = document.getElementById('luckyMult');
var idleIncomeEl = document.getElementById('idleIncome');
var idleRateEl = document.getElementById('idleRate');
var srAnnounce = document.getElementById('srAnnounce');
var flashOverlay = document.getElementById('flashOverlay');

// ==================== NUMBER FORMATTING ====================
// Single, clean number per value - compact form (1.2K, 3.4M) once it gets long,
// instead of a wall of digits and commas.
var compactFormatter = (typeof Intl !== 'undefined' && Intl.NumberFormat)
  ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
  : null;

function formatNum(n) {
  n = Math.round(n);
  if (compactFormatter && Math.abs(n) >= 10000) return compactFormatter.format(n);
  return n.toLocaleString();
}

// ==================== ANIMATED NUMBER TWEEN ====================
// Tweening is reserved for the coin balance changing as the direct result of a
// tap (win/loss) - it should NOT run for bet adjustments or other coin grants,
// which just set the number instantly.
var tweenState = {};
function tweenNumber(el, key, from, to, duration) {
  if (tweenState[key]) cancelAnimationFrame(tweenState[key]);
  if (from === to) { el.textContent = formatNum(to); return; }
  var start = performance.now();
  function step(now) {
    var t = Math.min(1, (now - start) / duration);
    var eased = 1 - Math.pow(1 - t, 3);
    var val = Math.round(from + (to - from) * eased);
    el.textContent = formatNum(val);
    if (t < 1) {
      tweenState[key] = requestAnimationFrame(step);
    } else {
      delete tweenState[key];
    }
  }
  tweenState[key] = requestAnimationFrame(step);
}

var lastShownCoins = coins;

// ==================== IDLE INCOME CALCULATION ====================
function calculateIdleIncome() {
  var now = Date.now();
  var timePassed = now - lastVisit;
  var minutes = Math.floor(timePassed / 60000);
  var maxMinutes = 480;
  minutes = Math.min(minutes, maxMinutes);
  var tier = getTierLevel();
  var rate = tier + 1;
  return minutes * rate;
}

function getIdleRate() {
  return getTierLevel() + 1;
}

// ==================== AMBIENT PARTICLES ====================
var ambientBg = document.getElementById('ambientBg');
for (var i = 0; i < 10; i++) {
  var p = document.createElement('div');
  p.className = 'ambient-particle';
  p.style.left = Math.random() * 100 + '%';
  p.style.animationDelay = Math.random() * 8 + 's';
  p.style.animationDuration = (6 + Math.random() * 4) + 's';
  ambientBg.appendChild(p);
}
for (var i = 0; i < 8; i++) {
  var p = document.createElement('div');
  p.className = 'ambient-particle bottom';
  p.style.left = Math.random() * 100 + '%';
  p.style.bottom = '0';
  p.style.animationDelay = Math.random() * 10 + 's';
  p.style.animationDuration = (8 + Math.random() * 6) + 's';
  ambientBg.appendChild(p);
}

// ==================== FALLING COINS (IDLE VISUAL) ====================
function spawnFallingCoin() {
  var coin = document.createElement('div');
  coin.className = 'falling-coin';
  coin.textContent = '🪙';
  coin.style.left = Math.random() * 90 + 5 + '%';
  coin.style.animationDuration = (3 + Math.random() * 2) + 's';
  document.body.appendChild(coin);
  setTimeout(function() { if (coin.parentNode) coin.parentNode.removeChild(coin); }, 5000);
}
setInterval(function() { if (Math.random() < 0.3) spawnFallingCoin(); }, 2000);

// ==================== LIVE FEED ====================
var feedMessages = [
  'Someone just won <span class="win-text">500 coins</span> on a 2x!',
  'A player hit <span class="jackpot-text">10x JACKPOT</span> and won big!',
  '<span class="win-text">3x multiplier</span> just landed! 🎉',
  'Lucky player won <span class="jackpot-text">2,500 coins</span>!',
  'Hot streak! Someone got <span class="win-text">5 wins in a row</span>!',
  '<span class="jackpot-text">5x BIG WIN</span> just happened! 💰',
  'A player just claimed their <span class="win-text">daily bonus</span>!',
  'Wheel spin won <span class="jackpot-text">1,000 coins</span>! 🎡'
];

var liveFeedText = document.getElementById('liveFeedText');
var liveFeedTrack = liveFeedText.parentElement;

function updateLiveFeed() {
  var msg = feedMessages[Math.floor(Math.random() * feedMessages.length)];
  liveFeedText.innerHTML = '🎰 ' + msg;
  liveFeedText.style.transition = 'none';
  liveFeedText.style.transform = 'translateX(0)';
  void liveFeedText.offsetWidth;
  var trackWidth = liveFeedTrack.clientWidth;
  var textWidth = liveFeedText.scrollWidth;
  var distance = trackWidth + textWidth;
  var duration = distance / 60; // ~60px/s constant speed
  liveFeedText.style.transition = 'transform ' + duration + 's linear';
  liveFeedText.style.transform = 'translateX(-' + textWidth + 'px)';
}
updateLiveFeed();
setInterval(updateLiveFeed, 8000);

// ==================== AUDIO ====================
var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioCtx = null;
var isMuted = localStorage.getItem('ltMuted') === 'true';
var muteBtn = document.getElementById('muteBtn');

function updateMuteButton() {
  muteBtn.textContent = isMuted ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', isMuted);
}
updateMuteButton();

muteBtn.addEventListener('click', function() {
  isMuted = !isMuted;
  localStorage.setItem('ltMuted', isMuted.toString());
  updateMuteButton();
  if (!isMuted) { initAudio(); playSound('tap'); }
});

function initAudio() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}

function playSound(type) {
  if (!audioCtx || isMuted) return;
  try {
    var osc, gain;
    if (type === 'tap') {
      osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
      osc.start(); osc.stop(audioCtx.currentTime + 0.08);
    } else if (type === 'win') {
      [523, 659, 784, 1047].forEach(function(f, i) {
        osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(f, audioCtx.currentTime + i * 0.08);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4 + i * 0.08);
        osc.start(audioCtx.currentTime + i * 0.08);
        osc.stop(audioCtx.currentTime + 0.5 + i * 0.08);
      });
    } else if (type === 'bigwin') {
      [523, 659, 784, 1047, 1319, 1568].forEach(function(f, i) {
        osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(f, audioCtx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4 + i * 0.1);
        osc.start(audioCtx.currentTime + i * 0.1);
        osc.stop(audioCtx.currentTime + 0.5 + i * 0.1);
      });
    } else if (type === 'lose') {
      osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start(); osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'bonus') {
      [659, 784, 988, 1175, 1319].forEach(function(f, i) {
        osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.frequency.setValueAtTime(f, audioCtx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3 + i * 0.1);
        osc.start(audioCtx.currentTime + i * 0.1);
        osc.stop(audioCtx.currentTime + 0.4 + i * 0.1);
      });
    } else if (type === 'spin') {
      osc = audioCtx.createOscillator(); gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, audioCtx.currentTime);
      osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.5);
      osc.frequency.linearRampToValueAtTime(200, audioCtx.currentTime + 3);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 3);
      osc.start(); osc.stop(audioCtx.currentTime + 3);
    }
  } catch (e) {}
}

function vibrate(type) {
  if (!('vibrate' in navigator)) return;
  try {
    var p = { tap: 8, win: [40, 30, 60], bigwin: [30, 20, 50, 20, 80], lose: 100, bonus: [50, 30, 80], jackpot: [40, 20, 40, 20, 40, 20, 120] };
    navigator.vibrate(p[type] || 10);
  } catch (e) {}
}

// ==================== CONFETTI ====================
function spawnConfetti(big) {
  var colors = ['#fbbf24', '#4ade80', '#f87171', '#60a5fa', '#a78bfa', '#fde047'];
  var count = big ? 70 : 40;
  for (var i = 0; i < count; i++) {
    var c = document.createElement('div');
    c.className = 'confetti-piece';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    c.style.animationDelay = Math.random() * 0.5 + 's';
    c.style.borderRadius = Math.random() < 0.5 ? '50%' : '2px';
    document.body.appendChild(c);
    setTimeout(function(el) { if (el.parentNode) el.parentNode.removeChild(el); }.bind(null, c), 4000);
  }
}

function jackpotFx() {
  document.body.classList.add('jackpot-shake');
  setTimeout(function() { document.body.classList.remove('jackpot-shake'); }, 500);
  flashOverlay.classList.remove('go');
  void flashOverlay.offsetWidth;
  flashOverlay.classList.add('go');
}

// ==================== PARTICLES ====================
function spawnParticles(type) {
  var container = document.getElementById('particles');
  var emojis = type === 'bigwin' ? ['🪙', '💰', '💎', '✨', '👑'] : type === 'win' ? ['🪙', '✨', '💫'] : ['💨'];
  var count = type === 'bigwin' ? 20 : type === 'win' ? 12 : 5;
  for (var i = 0; i < count; i++) {
    var p = document.createElement('div');
    p.className = 'particle';
    p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    var angle = (i / count) * Math.PI * 2;
    var dist = 120 + Math.random() * 80;
    p.style.left = '95px'; p.style.top = '95px';
    p.style.setProperty('--tx', Math.cos(angle) * dist + 'px');
    p.style.setProperty('--ty', Math.sin(angle) * dist - 30 + 'px');
    p.style.setProperty('--rot', (Math.random() - 0.5) * 720 + 'deg');
    container.appendChild(p);
    setTimeout(function(el) { if (el.parentNode) el.parentNode.removeChild(el); }.bind(null, p), 1200);
  }
}

// ==================== DIFFICULTY ====================
// Penalty represents how many extra "loss" slots get mixed in at high balances.
// Computed analytically (capped) instead of growing an unbounded array.
function getDifficultyPenalty() {
  if (coins < 10000) return 0;
  return Math.min(Math.floor((coins - 10000) / 10000) + 1, 500);
}

function getAdjustedMultipliers() {
  var penalty = getDifficultyPenalty();
  if (penalty === 0) return baseMultipliers;
  var adj = baseMultipliers.slice();
  for (var i = 0; i < penalty; i++) adj.push(0);
  return adj;
}

function getWinChance() {
  var penalty = getDifficultyPenalty();
  var total = baseMultipliers.length + penalty;
  var winners = baseMultipliers.filter(function(x) { return x > 0; }).length;
  return Math.round((winners / total) * 100);
}

// ==================== TIERS ====================
var tiers = [
  { name: 'Bronze', min: 0, max: 5000, cls: 'tier-bronze', icon: '🥉' },
  { name: 'Silver', min: 5000, max: 25000, cls: 'tier-silver', icon: '🥈' },
  { name: 'Gold', min: 25000, max: 100000, cls: 'tier-gold', icon: '🥇' },
  { name: 'Platinum', min: 100000, max: 500000, cls: 'tier-platinum', icon: '💠' },
  { name: 'Diamond', min: 500000, max: Infinity, cls: 'tier-diamond', icon: '💎' }
];

function getTierLevel() {
  for (var i = tiers.length - 1; i >= 0; i--) {
    if (coins >= tiers[i].min) return i;
  }
  return 0;
}

function getTier() { return tiers[getTierLevel()]; }

function updateTierProgress() {
  var tier = getTier();
  var level = getTierLevel();
  var nextTier = tiers[Math.min(level + 1, tiers.length - 1)];

  tierNameEl.textContent = tier.name;
  tierIconEl.textContent = tier.icon;
  tierDisplay.className = 'tier-display ' + tier.cls;

  if (level < tiers.length - 1) {
    var progress = (coins - tier.min) / (nextTier.min - tier.min) * 100;
    tierProgressFill.style.width = Math.min(progress, 100) + '%';
    tierProgressText.textContent = formatNum(coins) + ' / ' + formatNum(nextTier.min) + ' to ' + nextTier.name;
  } else {
    tierProgressFill.style.width = '100%';
    tierProgressText.textContent = '🏆 MAX TIER!';
  }
}

// ==================== LUCKY HOUR ====================
var luckyTooltip = document.getElementById('luckyTooltip');

function checkLuckyHour() {
  var now = Date.now();
  if (luckyHourEnd > now) {
    luckyMultEl.classList.add('visible');
    tapButton.classList.add('lucky');
    document.getElementById('luckyHour').classList.add('lucky-hour');
    var remaining = Math.ceil((luckyHourEnd - now) / 1000);
    var mins = Math.floor(remaining / 60);
    var secs = remaining % 60;
    document.getElementById('luckyTimer').textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;
    return true;
  } else {
    luckyMultEl.classList.remove('visible');
    tapButton.classList.remove('lucky');
    document.getElementById('luckyHour').classList.remove('lucky-hour');
    luckyTooltip.classList.remove('visible');

    if (Math.random() < 0.02) {
      luckyHourEnd = now + 120000;
      luckyTooltip.classList.add('visible');
      playSound('bonus');
      vibrate('bonus');
      spawnConfetti();
      setTimeout(function() { luckyTooltip.classList.remove('visible'); }, 3000);
    } else {
      var minutesUntil = Math.floor(Math.random() * 10) + 1;
      document.getElementById('luckyTimer').textContent = '~' + minutesUntil + 'm';
    }
    return false;
  }
}
setInterval(checkLuckyHour, 1000);

document.getElementById('luckyHour').addEventListener('click', function() {
  if (luckyHourEnd <= Date.now()) {
    alert('⚡ Lucky Hour\n\nWhen active, ALL your wins are DOUBLED for 2 minutes!\n\nIt activates randomly - keep playing and watch for it!');
  }
});

// ==================== BONUSES ====================
var dailyBonus = document.getElementById('dailyBonus');
var wheelBonus = document.getElementById('wheelBonus');
var dailyModal = document.getElementById('dailyModal');
var wheelModal = document.getElementById('wheelModal');
var dailyFill = document.getElementById('dailyFill');
var wheelFill = document.getElementById('wheelFill');

var DAILY_COOLDOWN = 4 * 60 * 60 * 1000;
var WHEEL_COOLDOWN = 2 * 60 * 60 * 1000;

function updateBonusTimers() {
  var now = Date.now();

  var dailyElapsed = now - lastDaily;
  var dailyReady = dailyElapsed >= DAILY_COOLDOWN;
  if (dailyReady) {
    dailyBonus.classList.add('ready');
    document.getElementById('dailyTimer').textContent = 'Ready!';
  } else {
    dailyBonus.classList.remove('ready');
    var remaining = DAILY_COOLDOWN - dailyElapsed;
    var hrs = Math.floor(remaining / 3600000);
    var mins = Math.floor((remaining % 3600000) / 60000);
    document.getElementById('dailyTimer').textContent = hrs + 'h ' + mins + 'm';
    dailyFill.style.width = Math.min(100, (dailyElapsed / DAILY_COOLDOWN) * 100) + '%';
  }

  var wheelElapsed = now - lastWheel;
  var wheelReady = wheelElapsed >= WHEEL_COOLDOWN;
  if (wheelReady) {
    wheelBonus.classList.add('ready');
    document.getElementById('wheelTimer').textContent = 'Ready!';
  } else {
    wheelBonus.classList.remove('ready');
    var remaining2 = WHEEL_COOLDOWN - wheelElapsed;
    var hrs2 = Math.floor(remaining2 / 3600000);
    var mins2 = Math.floor((remaining2 % 3600000) / 60000);
    document.getElementById('wheelTimer').textContent = hrs2 + 'h ' + mins2 + 'm';
    wheelFill.style.width = Math.min(100, (wheelElapsed / WHEEL_COOLDOWN) * 100) + '%';
  }
}
setInterval(updateBonusTimers, 1000);

dailyBonus.addEventListener('click', function() {
  var now = Date.now();
  if (now - lastDaily >= DAILY_COOLDOWN) {
    var bonus = 500 + getTierLevel() * 250;
    document.getElementById('dailyAmount').textContent = '+' + formatNum(bonus);
    dailyModal.classList.add('visible');
  }
});

document.getElementById('claimDaily').addEventListener('click', function() {
  var bonus = 500 + getTierLevel() * 250;
  coins += bonus;
  lastDaily = Date.now();
  dailyModal.classList.remove('visible');
  playSound('bonus');
  vibrate('bonus');
  spawnConfetti();
  updateDisplay();
  saveState();
});

wheelBonus.addEventListener('click', function() {
  var now = Date.now();
  if (now - lastWheel >= WHEEL_COOLDOWN) {
    wheelModal.classList.add('visible');
    document.getElementById('wheel').style.transform = 'rotate(0deg)';
  }
});

var wheelResultModal = document.getElementById('wheelResultModal');
var wheelPrizeEl = document.getElementById('wheelPrize');
var currentWheelPrize = 0;

document.getElementById('spinWheel').addEventListener('click', function() {
  var btn = document.getElementById('spinWheel');
  btn.disabled = true;
  btn.textContent = 'Spinning...';

  var prizeIndex = getWeightedPrizeIndex();
  var tierMultiplier = getTierLevel() + 1;
  currentWheelPrize = wheelPrizes[prizeIndex] * tierMultiplier;

  var segmentAngle = 45;
  var baseRotation = 1800;
  var targetAngle = (prizeIndex * segmentAngle) + (segmentAngle / 2);
  var rotation = baseRotation + (360 - targetAngle) + Math.random() * 20 - 10;

  document.getElementById('wheel').style.transform = 'rotate(' + rotation + 'deg)';

  playSound('spin');
  vibrate('bigwin');

  setTimeout(function() {
    lastWheel = Date.now();
    wheelModal.classList.remove('visible');
    wheelPrizeEl.textContent = '+' + formatNum(currentWheelPrize) + ' coins!';
    wheelResultModal.classList.add('visible');
    playSound('bigwin');
    spawnConfetti();
    btn.disabled = false;
    btn.textContent = '🎰 SPIN!';

    setTimeout(function() {
      document.getElementById('wheel').style.transition = 'none';
      document.getElementById('wheel').style.transform = 'rotate(0deg)';
      setTimeout(function() {
        document.getElementById('wheel').style.transition = 'transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
      }, 50);
    }, 500);
  }, 4000);
});

document.getElementById('claimWheelPrize').addEventListener('click', function() {
  coins += currentWheelPrize;
  currentWheelPrize = 0;
  wheelResultModal.classList.remove('visible');
  updateDisplay();
  saveState();
});

// ==================== WELCOME BACK (IDLE EARNINGS) ====================
var welcomeBackModal = document.getElementById('welcomeBackModal');

function checkIdleEarnings() {
  idleCoinsEarned = calculateIdleIncome();
  if (idleCoinsEarned >= 10) {
    document.getElementById('idleEarnings').textContent = '+' + formatNum(idleCoinsEarned);
    welcomeBackModal.classList.add('visible');
  }
  lastVisit = Date.now();
  saveState();
}

document.getElementById('claimIdle').addEventListener('click', function() {
  coins += idleCoinsEarned;
  idleCoinsEarned = 0;
  welcomeBackModal.classList.remove('visible');
  playSound('bonus');
  vibrate('bonus');
  updateDisplay();
  saveState();
});

// ==================== RESET ====================
var resetModal = document.getElementById('resetModal');

document.getElementById('resetAllBtn').addEventListener('click', function() {
  resetModal.classList.add('visible');
});

document.getElementById('resetCancel').addEventListener('click', function() {
  resetModal.classList.remove('visible');
});

document.getElementById('resetConfirm').addEventListener('click', function() {
  // Only wipe game progress keys - preserve cookie consent & mute preference.
  GAME_KEYS.forEach(function(k) { localStorage.removeItem(k); });

  coins = 1000; bet = 50; gameHistory = []; streak = 0; lossStreak = 0;
  totalWins = 0; biggestWin = 0; bestStreak = 0; totalPlays = 0;
  peakBalance = 1000;
  lastDaily = 0; lastWheel = 0; lastVisit = Date.now();
  inRecoveryMode = false; recoveryWinsCount = 0;
  lastShownCoins = coins;

  tapButton.classList.remove('win', 'lose', 'bigwin', 'rolling', 'lucky');
  tapContent.classList.remove('hidden');
  rollingText.classList.remove('visible');
  resultContainer.classList.remove('visible');
  resetModal.classList.remove('visible');

  playSound('win');
  vibrate('win');
  updateDisplay();
});

// ==================== VALIDATION ====================
function validateBet() {
  if (isNaN(bet) || bet < 10) bet = 10;
  bet = Math.floor(bet / 10) * 10;
  if (bet > coins) bet = Math.max(10, Math.floor(coins / 10) * 10);
  if (coins < 10) bet = coins;
}

// ==================== DISPLAY ====================
// animateCoins: only true right after a tap resolves into a win/loss. Every
// other call (bet adjustments, bonus claims, reset, etc.) sets the coin
// number instantly so the UI doesn't tick/reload outside of actual play.
function updateDisplay(animateCoins) {
  validateBet();

  if (animateCoins && coins !== lastShownCoins) {
    tweenNumber(coinAmountEl, 'coins', lastShownCoins, coins, 600);
  } else {
    coinAmountEl.textContent = formatNum(coins);
  }
  lastShownCoins = coins;
  betAmountEl.textContent = formatNum(bet);

  totalWinsEl.textContent = formatNum(totalWins);
  biggestWinEl.textContent = formatNum(biggestWin);
  bestStreakEl.textContent = bestStreak.toString();
  totalPlaysEl.textContent = formatNum(totalPlays);

  peakBalanceEl.textContent = formatNum(peakBalance);
  if (coins >= peakBalance * 0.9 && coins < peakBalance) {
    peakBalanceEl.classList.add('peak-glow');
  } else {
    peakBalanceEl.classList.remove('peak-glow');
  }

  var coinsToGo = peakBalance - coins;
  if (coinsToGo > 0 && coinsToGo <= peakBalance * 0.5 && peakBalance > 1000) {
    peakChase.classList.add('visible');
    peakChaseAmount.textContent = formatNum(coinsToGo);
    if (coinsToGo <= peakBalance * 0.1) {
      peakChase.classList.add('close');
    } else {
      peakChase.classList.remove('close');
    }
  } else {
    peakChase.classList.remove('visible');
    peakChase.classList.remove('close');
  }

  if (inRecoveryMode) {
    recoveryIndicator.classList.add('visible');
    recoveryProgressEl.textContent = recoveryWinsCount;
  } else {
    recoveryIndicator.classList.remove('visible');
  }

  updateTierProgress();

  var rate = getIdleRate();
  idleRateEl.textContent = rate;
  idleIncomeEl.classList.add('visible');

  oddsText.textContent = getWinChance() + '% win • up to 10x';

  if (streak >= 2) {
    streakEl.classList.add('visible');
    streakCountEl.textContent = streak;
    streakEl.style.filter = streak >= 6 ? 'hue-rotate(-20deg) saturate(1.3)' : 'none';
  } else {
    streakEl.classList.remove('visible');
  }

  resetBtn.classList.toggle('visible', coins < 10);

  renderHistory();
  saveState();
}

function renderHistory() {
  if (!gameHistory || gameHistory.length === 0) {
    historySection.classList.remove('visible');
    return;
  }
  historySection.classList.add('visible');
  historyList.innerHTML = gameHistory.slice(0, 8).map(function(item) {
    // Style by the actual net change, not just "did a multiplier apply" - a
    // 0.5x roll counts as a "win" in the odds table but nets a coin loss, so
    // it must render as a loss (and never double up a +/- sign).
    var net = item.amount;
    var cls = net > 0 ? (item.multiplier >= 5 ? 'bigwin' : 'win') : 'lose';
    var sign = net > 0 ? '+' : '';
    return '<div class="history-item ' + cls + '">' +
      '<span class="history-amount ' + cls + '">' + sign + formatNum(net) + '</span>' +
      (item.won ? '<span class="history-mult">' + item.multiplier + 'x</span>' : '') + '</div>';
  }).join('');
}

function saveState() {
  if (!canSave) return;
  try {
    localStorage.setItem('ltCoins', coins);
    localStorage.setItem('ltBet', bet);
    localStorage.setItem('ltHistory', JSON.stringify(gameHistory.slice(0, 10)));
    localStorage.setItem('ltWins', totalWins);
    localStorage.setItem('ltBiggest', biggestWin);
    localStorage.setItem('ltBestStreak', bestStreak);
    localStorage.setItem('ltPlays', totalPlays);
    localStorage.setItem('ltPeak', peakBalance);
    localStorage.setItem('ltLastDaily', lastDaily);
    localStorage.setItem('ltLastWheel', lastWheel);
    localStorage.setItem('ltLastVisit', lastVisit);
  } catch (e) {}
}

function animateCoinDisplay(type) {
  coinDisplay.classList.remove('win-pop', 'lose-shrink');
  void coinDisplay.offsetWidth;
  coinDisplay.classList.add(type === 'win' ? 'win-pop' : 'lose-shrink');
  setTimeout(function() { coinDisplay.classList.remove('win-pop', 'lose-shrink'); }, 500);
}

// ==================== MAIN GAME ====================
function handleTap(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  validateBet();

  if (isFlipping) return;
  if (coins < 10 || bet <= 0) {
    tapButton.classList.add('lose');
    vibrate('lose');
    setTimeout(function() { tapButton.classList.remove('lose'); }, 300);
    return;
  }

  initAudio();
  playSound('tap');
  vibrate('tap');

  isFlipping = true;
  coins -= bet;
  totalPlays++;
  updateDisplay();

  tapButton.classList.remove('win', 'lose', 'bigwin');
  tapButton.classList.add('rolling');
  tapContent.classList.add('hidden');
  rollingText.classList.add('visible');
  resultContainer.classList.remove('visible');

  setTimeout(function() {
    var mults = getAdjustedMultipliers();
    var roll = mults[Math.floor(Math.random() * mults.length)];

    if (checkLuckyHour() && roll > 0) roll *= 2;

    var winAmount = Math.floor(bet * roll);
    var won = roll > 0;
    var isBigWin = roll >= 5;
    var isJackpot = roll >= 10;

    tapButton.classList.remove('rolling');
    rollingText.classList.remove('visible');

    if (won) {
      totalWins++;
      lossStreak = 0;
      if (winAmount > biggestWin) biggestWin = winAmount;

      if (inRecoveryMode) {
        recoveryWinsCount++;
        if (recoveryWinsCount >= recoveryWinsNeeded) {
          inRecoveryMode = false;
          recoveryWinsCount = 0;
        }
      }

      tapButton.classList.add(isBigWin ? 'bigwin' : 'win');
      resultEmoji.textContent = isBigWin ? '💰' : '✨';
      playSound(isBigWin ? 'bigwin' : 'win');
      vibrate(isJackpot ? 'jackpot' : (isBigWin ? 'bigwin' : 'win'));
      spawnParticles(isBigWin ? 'bigwin' : 'win');
      if (isJackpot) { jackpotFx(); spawnConfetti(true); }
      else if (isBigWin) spawnConfetti();

      resultText.textContent = '+' + formatNum(winAmount);
      multiplierText.textContent = roll + 'x';
      multiplierText.style.display = 'block';
      coins += winAmount;
      streak++;
      if (streak > bestStreak) bestStreak = streak;
      srAnnounce.textContent = 'You won ' + formatNum(winAmount) + ' coins at ' + roll + 'x';

      if (coins > peakBalance) {
        var oldPeak = peakBalance;
        peakBalance = coins;

        peakBalanceEl.classList.add('new-peak');
        setTimeout(function() { peakBalanceEl.classList.remove('new-peak'); }, 600);

        if (coins > oldPeak * 1.1 || oldPeak === 1000) {
          peakCelebrationAmount.textContent = '🪙 ' + formatNum(coins);
          peakCelebration.classList.add('visible');
          spawnConfetti();
          playSound('bonus');
          vibrate('bonus');

          setTimeout(function() { peakCelebration.classList.remove('visible'); }, 2500);
        }
      }

      setTimeout(function() { animateCoinDisplay('win'); }, 100);
    } else {
      streak = 0;
      lossStreak++;

      if (!inRecoveryMode && totalPlays > 1) {
        inRecoveryMode = true;
        recoveryWinsCount = 0;
      }

      tapButton.classList.add('lose');
      resultEmoji.textContent = '💨';
      resultText.textContent = '-' + formatNum(bet);
      multiplierText.style.display = 'none';
      playSound('lose');
      vibrate('lose');
      spawnParticles('lose');
      srAnnounce.textContent = 'You lost ' + formatNum(bet) + ' coins';
      setTimeout(function() { animateCoinDisplay('lose'); }, 100);
    }

    resultContainer.classList.add('visible');

    gameHistory.unshift({ won: won, amount: won ? winAmount - bet : -bet, multiplier: roll, id: Date.now() });

    validateBet();
    updateDisplay(true);
    isFlipping = false;
  }, 1300 + Math.random() * 400);
}

// ==================== BET CONTROLS ====================
function adjustBet(amt) {
  bet = Math.max(10, Math.min(coins, Math.round((bet + amt) / 10) * 10));
  vibrate('tap');
  updateDisplay();
}

function addListener(el, fn) {
  if (!el) return;
  el.addEventListener('click', fn);
  el.addEventListener('touchend', function(e) { e.preventDefault(); fn(e); }, { passive: false });
}

addListener(tapButton, handleTap);
addListener(document.getElementById('betMinus'), function() { adjustBet(-10); });
addListener(document.getElementById('betPlus'), function() { adjustBet(10); });
addListener(document.getElementById('halfBet'), function() { bet = Math.max(10, Math.floor(bet / 2 / 10) * 10); updateDisplay(); });
addListener(document.getElementById('doubleBet'), function() { bet = Math.min(coins, Math.floor(bet * 2 / 10) * 10); updateDisplay(); });
addListener(document.getElementById('maxBet'), function() { bet = Math.floor(coins / 10) * 10; if (bet < 10 && coins >= 10) bet = 10; updateDisplay(); });
addListener(resetBtn, function() {
  coins = 1000; bet = 50; gameHistory = []; streak = 0; inRecoveryMode = false; recoveryWinsCount = 0;
  lastShownCoins = coins;
  tapButton.className = 'tap-button';
  tapContent.classList.remove('hidden');
  rollingText.classList.remove('visible');
  resultContainer.classList.remove('visible');
  playSound('win');
  updateDisplay();
});

// ==================== PWA ====================
var deferredPrompt = null;
var installPrompt = document.getElementById('installPrompt');

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredPrompt = e;
  setTimeout(function() { installPrompt.classList.add('visible'); }, 5000);
});

addListener(document.getElementById('installLater'), function() { installPrompt.classList.remove('visible'); });
addListener(document.getElementById('installNow'), function() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function() { deferredPrompt = null; installPrompt.classList.remove('visible'); });
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(function() {});
}

// ==================== INIT ====================
updateDisplay();
updateBonusTimers();
checkLuckyHour();
setTimeout(checkIdleEarnings, 1000);
