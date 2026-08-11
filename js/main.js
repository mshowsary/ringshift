(function(root){
  'use strict';
  var RS=root.RS=root.RS||{},doc=root.document;if(!doc)return;
  var STATE={SPLASH:'splash',MENU:'menu',PLAYING:'playing',DYING:'dying',GAMEOVER:'gameover'};
  var state=STATE.SPLASH,game=null,save=null,renderer=null;
  var raf=0,last=0,clock=0,shake=0,deathDelay=0,calloutUntil=0,sdkPaused=false,reduced=false,tutorial=false;

  try{var mq=root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)');reduced=!!(mq&&mq.matches);if(mq&&mq.addEventListener)mq.addEventListener('change',function(e){reduced=e.matches;});}catch(e){}

  function persist(){return save?RS.sdk.save(save):Promise.resolve();}
  function animateCallout(text,kind,dur){RS.ui.callout(text,kind);calloutUntil=clock+(dur||.72);}
  function startLoop(){if(raf||sdkPaused)return;last=0;raf=root.requestAnimationFrame(frame);}
  function stopLoop(){if(raf){root.cancelAnimationFrame(raf);raf=0;}last=0;}

  function startGame(){
    RS.audio.init();RS.audio.resume();RS.audio.startMusic();RS.audio.setOverdrive(false);
    game=RS.createGame({});state=STATE.PLAYING;deathDelay=0;shake=0;renderer.clearFx();RS.ui.resetHud();RS.ui.showScreen('play');
    tutorial=!save.tutorialSeen;RS.ui.setTutorial(tutorial);last=0;
  }
  function toMenu(){
    game=null;state=STATE.MENU;RS.audio.stopMusic();RS.audio.setOverdrive(false);RS.ui.setTutorial(false);RS.ui.clearCallout();RS.ui.setMenu(save);RS.ui.showScreen('menu');
    try{doc.getElementById('btn-play').focus({preventScroll:true});}catch(e){}
  }
  function endRun(){
    if(!game)return;
    state=STATE.GAMEOVER;RS.audio.stopMusic();RS.audio.setOverdrive(false);
    var score=game.score,isNew=score>save.best;
    save.runs+=1;save.totalShards+=game.shards;save.totalNearMisses+=game.nearMisses;
    save.bestCombo=Math.max(save.bestCombo,game.bestCombo);save.bestTime=Math.max(save.bestTime,game.time);
    if(isNew){save.best=score;RS.audio.sfx('best');}
    // Persist the exact best-score value before sending that same dimension
    // to YouTube engagement. The SDK wrapper swallows transient SDK errors.
    persist().then(function(){return RS.sdk.sendBestScore(save.best);});
    RS.ui.setTutorial(false);RS.ui.showGameOver({score:score,time:game.time,combo:game.bestCombo,near:game.nearMisses,newBest:isNew});
  }

  function processEvents(){
    while(game&&game.events.length){
      var ev=game.events.shift();renderer.onEvent(ev,game);
      if(ev.type==='hop')RS.audio.sfx('hop');
      else if(ev.type==='mine-armed')RS.audio.sfx('armed');
      else if(ev.type==='shard')RS.audio.sfx('shard');
      else if(ev.type==='nearmiss'){RS.audio.sfx('close');animateCallout('CLOSE CALL','rush',.62);}
      else if(ev.type==='precision'){RS.audio.sfx('perfect');animateCallout('PERFECT SHIFT  ×'+ev.combo,'perfect',.78);}
      else if(ev.type==='overdrive-start'){RS.audio.setOverdrive(true);RS.audio.sfx('rush');animateCallout('OVERDRIVE  ×2','rush',1.0);shake=Math.max(shake,.36);}
      else if(ev.type==='overdrive-end'){RS.audio.setOverdrive(false);}
      else if(ev.type==='milestone'){RS.audio.sfx('milestone');animateCallout(ev.value+'s  //  SPEED UP','',.72);}
      else if(ev.type==='death'){RS.audio.sfx('death');shake=1;deathDelay=.48;state=STATE.DYING;}
    }
  }

  function frame(ts){
    raf=0;if(sdkPaused)return;
    raf=root.requestAnimationFrame(frame);
    if(!last){last=ts;return;}
    var dt=Math.min((ts-last)/1000,.05);last=ts;clock+=dt;shake=Math.max(0,shake-dt*2.1);
    if(calloutUntil&&clock>=calloutUntil){calloutUntil=0;RS.ui.clearCallout();}

    if(state===STATE.PLAYING&&game){
      game.update(dt);processEvents();RS.ui.updateHud(game);
    }else if(state===STATE.DYING&&game){
      deathDelay-=dt;if(deathDelay<=0)endRun();
    }
    renderer.draw(game,(state===STATE.MENU||state===STATE.SPLASH)?{t:clock,dt:dt,shake:0,reducedMotion:reduced}:{t:clock,dt:dt,shake:shake,reducedMotion:reduced});
  }

  function shift(){
    if(sdkPaused||RS.ui.topOverlay())return;
    RS.audio.init();
    if(state===STATE.PLAYING&&game){
      if(tutorial){tutorial=false;save.tutorialSeen=true;RS.ui.setTutorial(false);persist();}
      game.hop();
    }
  }
  function isUiTarget(t){return !!(t&&t.closest&&t.closest('button,input,.overlay,.menu-card,.result-card'));}
  function onKey(e){
    if(e.key==='Escape'){
      var top=RS.ui.topOverlay();if(top)RS.ui.close(top);
      return; // never preventDefault on Esc
    }
    if(e.code==='Space'||e.key==='Enter'||e.key==='ArrowUp'){
      if(RS.ui.topOverlay())return;
      if(state===STATE.PLAYING){e.preventDefault();shift();}
      else if(state===STATE.MENU||state===STATE.GAMEOVER){e.preventDefault();startGame();}
    }
  }

  function setSdkPaused(v){
    sdkPaused=!!v;
    if(sdkPaused){
      persist();stopLoop();RS.audio.suspend();doc.documentElement.classList.add('sdk-frozen');doc.getElementById('sdk-paused').classList.remove('hidden');
    }else{
      doc.documentElement.classList.remove('sdk-frozen');doc.getElementById('sdk-paused').classList.add('hidden');RS.audio.resume();
      if(state===STATE.PLAYING)RS.audio.startMusic();startLoop();
    }
  }

  function boot(){
    renderer=RS.createRenderer(doc.getElementById('game-canvas'));
    renderer.draw(null,{t:0,dt:0,shake:0,reducedMotion:reduced});
    RS.sdk.firstFrameReady();

    root.addEventListener('resize',function(){renderer.resize();});
    doc.addEventListener('pointerdown',function(e){if(!isUiTarget(e.target))shift();},{passive:true});
    doc.addEventListener('keydown',onKey);

    RS.ui.bind({
      play:startGame,menu:toMenu,sfx:function(){RS.audio.init();RS.audio.sfx('ui');},
      music:function(v){save.music=v;RS.audio.setMusic(v);persist();},
      sfxVolume:function(v){save.sfx=v;RS.audio.setSfx(v);persist();}
    });

    RS.sdk.onAudioEnabledChange(function(v){RS.audio.setEnabled(v);});
    RS.sdk.onPause(function(){setSdkPaused(true);});
    RS.sdk.onResume(function(){setSdkPaused(false);});

    RS.sdk.init().then(function(data){
      save=data.save;RS.i18n.setLocale(data.lang);RS.i18n.apply(doc);
      RS.audio.setEnabled(RS.sdk.isAudioEnabled());RS.audio.setMusic(save.music);RS.audio.setSfx(save.sfx);RS.ui.setSliders(save.music,save.sfx);
      toMenu();RS.sdk.gameReady();startLoop();
    }).catch(function(){
      save=RS.saveCodec.parse();toMenu();RS.sdk.gameReady();startLoop();
    });
  }

  RS.debug={state:function(){return state;},game:function(){return game;},save:function(){return save;},renderer:function(){return renderer;},sdkPaused:function(){return sdkPaused;}};
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot);else boot();
})(typeof window!=='undefined'?window:globalThis);