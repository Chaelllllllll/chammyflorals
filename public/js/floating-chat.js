(function(){
  function isLoggedIn(){
    try {
      return !!(localStorage.getItem('auth_token') || (document.cookie && document.cookie.indexOf('connect.sid') !== -1));
    } catch (e) { return false; }
  }

  function createButton(id){
    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'floating-chat-btn';
    btn.title = 'Chat with seller';
    btn.onclick = function(){ window.location.href = '/dashboard.html?openChat=1'; };
    btn.innerHTML = '<i class="fa fa-comments"></i>';
    return btn;
  }

  function ensureButton(){
    const present = document.getElementById('floatingChatBtn') || document.getElementById('floatingChatBtnIndex') || document.getElementById('floatingChatBtnReviews');
    if (isLoggedIn()){
      if (!present) {
        // prefer a stable id
        const btn = createButton('floatingChatBtn');
        document.body.appendChild(btn);
      }
    } else {
      if (present) try { present.remove(); } catch(e){}
    }
  }

  // Run on load
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    ensureButton();
  } else {
    document.addEventListener('DOMContentLoaded', ensureButton);
  }

  // Respond to storage events (other tabs)
  window.addEventListener('storage', ensureButton);

  // Allow other scripts to notify auth changes in same tab
  window.addEventListener('auth:changed', ensureButton);

  // Poll for auth changes for up to 30s to catch login flows that set localStorage without reload
  (function pollAuth(){
    let last = isLoggedIn();
    let tries = 0;
    const id = setInterval(()=>{
      tries++;
      const cur = isLoggedIn();
      if (cur !== last) {
        last = cur; ensureButton();
        if (cur) { clearInterval(id); }
      }
      if (tries > 30) clearInterval(id);
    }, 1000);
  })();
})();
