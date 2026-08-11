(function(root){
  'use strict';
  var RS=root.RS=root.RS||{},doc=root.document;if(!doc)return;
  function el(id){return doc.getElementById(id);}
  var overlays=[],lastScore=-1,lastCombo=-1,lastFlow=-1;

  RS.ui={
    showScreen:function(name){
      ['screen-splash','screen-menu','screen-gameover'].forEach(function(id){el(id).classList.add('hidden');});
      // 'play' has no screen element — it is canvas + HUD only.
      if(name&&name!=='play'){var n=el('screen-'+name);if(n)n.classList.remove('hidden');}
      el('hud').classList.toggle('hidden',name!=='play');
    },
    setMenu:function(save){
      var stats=el('menu-stats');
      if(save.best>0||save.runs>0){stats.classList.remove('hidden');el('menu-best').textContent=String(save.best);el('menu-combo').textContent='x'+save.bestCombo;}
      else stats.classList.add('hidden');
    },
    resetHud:function(){lastScore=-1;lastCombo=-1;lastFlow=-1;el('hud-score').textContent='0';el('hud-combo').textContent='x1';el('flow-fill').style.width='0%';el('flow-spark').style.left='0%';el('flow-spark').style.opacity='0';el('overdrive-label').classList.add('hidden');el('status-kicker').textContent='FLOW';},
    updateHud:function(g){
      if(g.score!==lastScore){lastScore=g.score;el('hud-score').textContent=String(g.score);}
      if(g.multiplier!==lastCombo){lastCombo=g.multiplier;el('hud-combo').textContent='x'+g.multiplier;}
      var flow=Math.max(0,Math.min(100,g.flow));
      if(Math.abs(flow-lastFlow)>.2){lastFlow=flow;el('flow-fill').style.width=flow+'%';el('flow-spark').style.left=flow+'%';el('flow-spark').style.opacity=flow>4&&flow<99?'1':'0';}
      el('overdrive-label').classList.toggle('hidden',!g.overdrive);
      el('status-kicker').textContent=g.overdrive?'FLOW BURN':'FLOW';
    },
    setTutorial:function(v){el('tutorial').classList.toggle('hidden',!v);},
    callout:function(text,kind){var n=el('callout');n.textContent=text;n.className='callout '+(kind||'');void n.offsetWidth;n.classList.remove('hidden');},
    clearCallout:function(){el('callout').classList.add('hidden');},
    showGameOver:function(info){
      el('result-score').textContent=String(info.score);el('result-time').textContent=info.time.toFixed(1)+'s';el('result-combo').textContent='x'+info.combo;el('result-near').textContent=String(info.near);
      el('new-best').classList.toggle('hidden',!info.newBest);el('result-headline').textContent=info.newBest?RS.i18n.t('newBest'):RS.i18n.t('holdTheLine');
      this.showScreen('gameover');
      try{el('btn-retry').focus({preventScroll:true});}catch(e){}
    },
    open:function(name){
      var id='overlay-'+name;if(overlays.indexOf(name)<0)overlays.push(name);el(id).classList.remove('hidden');
      var focus=name==='how'?'btn-how-close':'btn-settings-close';try{el(focus).focus({preventScroll:true});}catch(e){}
    },
    close:function(name){var n=name||overlays[overlays.length-1];if(!n)return;var i=overlays.indexOf(n);if(i>=0)overlays.splice(i,1);el('overlay-'+n).classList.add('hidden');},
    topOverlay:function(){return overlays.length?overlays[overlays.length-1]:null;},
    setSliders:function(m,s){el('slider-music').value=String(Math.round(m*100));el('slider-sfx').value=String(Math.round(s*100));},
    bind:function(h){
      el('btn-play').addEventListener('click',h.play);el('btn-retry').addEventListener('click',h.play);el('btn-menu').addEventListener('click',h.menu);
      el('btn-how').addEventListener('click',function(){h.sfx();RS.ui.open('how');});el('btn-how-close').addEventListener('click',function(){h.sfx();RS.ui.close('how');});
      el('btn-settings').addEventListener('click',function(){h.sfx();RS.ui.open('settings');});el('btn-settings-close').addEventListener('click',function(){h.sfx();RS.ui.close('settings');});
      el('slider-music').addEventListener('input',function(e){h.music(Number(e.target.value)/100);});
      el('slider-sfx').addEventListener('input',function(e){h.sfxVolume(Number(e.target.value)/100);});
    }
  };
})(typeof window!=='undefined'?window:globalThis);