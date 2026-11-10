/* BURGERHZZ 共用配樂：首頁與 /apps/ 都載這支。
 *
 * 換頁時瀏覽器一定會把聲音停掉，沒辦法真的「不中斷」。這裡做的是接續：
 *   sessionStorage 記住「這個分頁開著配樂」和配樂開始的時間點（bgm_t0），
 *   下一頁載入時用同一個起點算出現在該在第幾拍，從那一拍接著播，節奏不會重來。
 *   瀏覽器若不允許自動出聲（Safari、或 Chrome 判斷沒有互動），
 *   就等使用者在頁面上第一次點擊／按鍵再接上，按鈕顯示「點任意處繼續」。
 *
 * 頁面需要一顆 id="sfx" 的按鈕，裡面有 id="sfxLabel"。
 */
/* 90s Chill Hip Hop —— Web Audio 即時合成，不載任何音檔。
 *
 * 86 BPM，四小節循環 Dm9 → G13 → Cmaj9 → Am9（爵士味的 ii-V-I-vi）。
 *
 * 關鍵在三件事，少了任何一個就不像 90 年代的東西：
 *   swing    十六分音符的偶數格往後推 16%，鬆垮的拖拍感就是從這來的
 *   boom bap 大鼓落在 1 與第 3 拍前，小鼓釘死在 2、4，中間留白
 *   lo-fi    整條匯流排過 6.8kHz 低通 + 黑膠雜訊，把數位的銳利磨掉
 *
 * 排程用 lookahead：每 60ms 把未來 0.25 秒的音排進 AudioContext 時間軸。
 * 直接用 setTimeout 會被主執行緒的版面繪製卡住而抖拍。
 */
(function () {
  var ctx = null, master = null, drums = null, keys = null, noise = null;
  var crackleSrc = null, timer = null;
  var nextTime = 0, step = 0, playing = false;

  var BPM = 86, BEAT = 60 / BPM, SIX = BEAT / 4;   // 十六分音符
  var SWING = 0.16;                                 // 偶數格往後推的比例

  var PROG = [
    { ch: [62, 65, 69, 72, 76], bass: 38 },   // Dm9
    { ch: [55, 59, 65, 69, 76], bass: 31 },   // G13
    { ch: [60, 64, 67, 71, 74], bass: 36 },   // Cmaj9
    { ch: [57, 60, 64, 67, 71], bass: 33 }    // Am9
  ];

  // 每小節 16 格。留白比填滿重要，boom bap 的呼吸感全靠這個。
  var KICK  = [0, 7, 10];
  var SNARE = [4, 12];
  var HAT   = [0, 2, 4, 6, 8, 10, 12, 14];
  var STAB  = [2, 11];
  var BASSP = [0, 10];

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function kick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(125, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g); g.connect(drums);
    o.start(t); o.stop(t + 0.42);
  }

  function snare(t, vel) {
    var s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), gn = ctx.createGain();
    s.buffer = noise;
    hp.type = 'highpass'; hp.frequency.value = 1500;
    gn.gain.setValueAtTime(vel * 0.5, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    s.connect(hp); hp.connect(gn); gn.connect(drums);
    s.start(t); s.stop(t + 0.18);

    var o = ctx.createOscillator(), go = ctx.createGain();   // 鼓身，沒有這層小鼓會太薄
    o.type = 'triangle';
    o.frequency.setValueAtTime(195, t);
    o.frequency.exponentialRampToValueAtTime(125, t + 0.09);
    go.gain.setValueAtTime(vel * 0.32, t);
    go.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(go); go.connect(drums);
    o.start(t); o.stop(t + 0.13);
  }

  function hat(t, vel, open) {
    var s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    var dur = open ? 0.17 : 0.032;
    s.buffer = noise;
    hp.type = 'highpass'; hp.frequency.value = 8200;
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(hp); hp.connect(g); g.connect(drums);
    s.start(t); s.stop(t + dur + 0.02);
  }

  function rhodes(t, f, dur, vel) {
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
    var g = ctx.createGain(), g2 = ctx.createGain(), lp = ctx.createBiquadFilter();
    o1.type = 'sine'; o1.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f * 2.004;
    o1.detune.value = (Math.random() - 0.5) * 9;      // 每次微微走音，模擬卡帶的抖動
    g2.gain.value = 0.14;
    lp.type = 'lowpass'; lp.frequency.value = 2000;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(vel * 0.25, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(keys);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  function bass(t, f, dur) {
    var o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f;
    lp.type = 'lowpass'; lp.frequency.value = 380;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function has(arr, v) { return arr.indexOf(v) !== -1; }

  function schedule() {
    while (nextTime < ctx.currentTime + 0.25) {
      var bar = Math.floor(step / 16) % 4;
      var i = step % 16;
      var P = PROG[bar];
      var t = nextTime + (i % 2 === 1 ? SIX * SWING : 0);    // swing 只推偶數格

      if (has(KICK, i))  kick(t);
      if (has(SNARE, i)) snare(t, 0.9);
      if (i === 15 && bar === 3) snare(t, 0.45);             // 過門，四小節收尾用
      if (has(HAT, i))   hat(t, i % 4 === 0 ? 0.05 : 0.03, i === 14);
      if (has(BASSP, i)) bass(t, hz(P.bass), BEAT * 0.85);
      if (has(STAB, i)) {
        P.ch.forEach(function (m, k) { rhodes(t, hz(m), BEAT * 1.6, 0.05 - k * 0.004); });
      }

      nextTime += SIX;
      step++;
    }
  }

  function makeNoise() {
    var len = Math.floor(ctx.sampleRate * 0.25);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noise.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }

  /* 黑膠雜訊：底噪加上稀疏的爆音，是 lo-fi 的靈魂 */
  function makeCrackle() {
    var len = Math.floor(ctx.sampleRate * 4);
    var b = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) {
      d[i] = Math.random() < 0.0007
        ? (Math.random() * 2 - 1) * 0.8
        : (Math.random() * 2 - 1) * 0.014;
    }
    return b;
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain(); master.gain.value = 0;
    var tape = ctx.createBiquadFilter();                 // 整條匯流排的 lo-fi 低通
    tape.type = 'lowpass'; tape.frequency.value = 6800;
    master.connect(tape); tape.connect(ctx.destination);

    drums = ctx.createGain(); drums.gain.value = 0.5; drums.connect(master);

    keys = ctx.createGain(); keys.gain.value = 1;        // 電鋼琴走 tremolo
    var lfo = ctx.createOscillator(); lfo.frequency.value = 4.8;
    var lfoG = ctx.createGain(); lfoG.gain.value = 0.12;
    lfo.connect(lfoG); lfoG.connect(keys.gain);
    keys.connect(master); lfo.start();

    makeNoise();
    crackleSrc = ctx.createBufferSource();
    crackleSrc.buffer = makeCrackle(); crackleSrc.loop = true;
    var cg = ctx.createGain(); cg.gain.value = 0.5;
    var cf = ctx.createBiquadFilter(); cf.type = 'bandpass';
    cf.frequency.value = 2600; cf.Q.value = 0.6;
    crackleSrc.connect(cf); cf.connect(cg); cg.connect(master);
    crackleSrc.start();
  }

  var KEY = 'bgm', KEY_T0 = 'bgm_t0';
  function store(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

  var btn, label;
  function ui(state) {
    if (!btn) return;
    btn.setAttribute('aria-pressed', state === 'on' ? 'true' : 'false');
    label.textContent = state === 'on' ? 'SFX: ON' : state === 'wait' ? 'SFX: 點任意處繼續' : 'SFX: OFF';
  }

  /* 從共同起點算出下一個十六分音符的位置，讓換頁後接在同一拍上 */
  function align() {
    var t0 = parseFloat(load(KEY_T0));
    if (!t0) { t0 = Date.now(); store(KEY_T0, String(t0)); }
    var el = (Date.now() - t0) / 1000;
    var n = Math.ceil(el / SIX);
    step = n;
    nextTime = ctx.currentTime + 0.05 + (n * SIX - el);
  }

  function run() {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.8, ctx.currentTime + 1.2);
    if (!playing) {
      align();
      timer = setInterval(schedule, 60);
      playing = true;
    }
    ui('on');
  }

  function start() {
    unwait();
    if (!ctx) build();
    store(KEY, 'on');
    var p = ctx.resume();
    if (ctx.state === 'running') { run(); return; }
    if (p && p.then) p.then(function () { if (ctx.state === 'running') run(); });
  }

  function stop() {
    unwait();
    store(KEY, 'off'); store(KEY_T0, null);
    if (!ctx) { ui('off'); return; }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.7);
    clearInterval(timer); timer = null; playing = false;
    ui('off');
  }

  /* 上一頁開著配樂：先試著直接接上，被擋就等第一次互動 */
  var EVTS = ['pointerdown', 'keydown', 'touchend'];
  var waiting = null;
  function unwait() {
    if (!waiting) return;
    EVTS.forEach(function (e) { document.removeEventListener(e, waiting, true); });
    waiting = null;
  }
  function resumeFromPrev() {
    if (!ctx) build();
    ui('wait');
    waiting = function (e) {
      if (e && btn && btn.contains(e.target)) return;   // 按鈕自己的點擊交給 click 處理
      ctx.resume().then(function () {
        if (ctx.state === 'running' && waiting) { unwait(); run(); }
      });
    };
    EVTS.forEach(function (e) { document.addEventListener(e, waiting, true); });
    waiting();
  }

  function init() {
    btn = document.getElementById('sfx');
    label = document.getElementById('sfxLabel');
    if (btn) btn.addEventListener('click', function (ev) {
      if (playing) stop(); else start();
    });
    if (load(KEY) === 'on') resumeFromPrev(); else ui('off');
  }

  window.BGM = {
    start: start,
    stop: stop,
    wasOn: function () { return load(KEY) === 'on'; },
    entered: function () { return load(KEY) !== null; },
    markEntered: function () { if (load(KEY) === null) store(KEY, 'off'); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
