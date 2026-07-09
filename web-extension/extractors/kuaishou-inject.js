(function() {
    if (document.getElementById('__kwai_inj')) return;
    var s = document.createElement('script');
    s.id = '__kwai_inj';
    s.textContent = '(function(){if(window.__kwaiI)return;window.__kwaiI=true;console.log("[KWAI_INJECT] installed");function cap(u,d){if(typeof u!="string"||u.indexOf("/rest/cp/works/v2/video/pc/photo/list")<0)return;try{var p=new URL(u,location.origin);var v=p.searchParams.get("__NS_sig3");if(v)document.documentElement.setAttribute("data-kwai-s",v);console.log("[KWAI_INJECT] captured sig3+data len:",d?d.length:0)}catch(e){}if(d){try{var x=document.getElementById("__kwai_d");if(!x){x=document.createElement("div");x.id="__kwai_d";x.style.display="none";document.documentElement.appendChild(x)}x.textContent=d}catch(e){}}}var F=window.fetch;window.fetch=function(i,o){var u=i instanceof Request?i.url:String(i);var r=F.call(this,i,o);r.then(function(rp){var c=rp.clone();c.text().then(function(t){cap(u,t)}).catch(function(){})}).catch(function(){});return r};var O=XMLHttpRequest.prototype.open;var S=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.open=function(m,u){this._u=u;return O.apply(this,arguments)};XMLHttpRequest.prototype.send=function(b){var t=this;this.addEventListener("load",function(){cap(t._u,t.responseText)});return S.apply(this,arguments)}})();';
    document.documentElement.appendChild(s);
    s.remove();
})();
