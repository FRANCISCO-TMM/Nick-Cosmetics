/* =========================================================
   script.js — shared site behaviour
   Sections: navigation, scroll reveal, academic planner,
   contact form validation
   ========================================================= */

/* ---------- Mobile navigation ---------- */
(function initNav(){
  const toggle = document.querySelector('.nav-toggle');
  const list = document.querySelector('.nav-list');
  if(!toggle || !list) return;

  toggle.addEventListener('click', function(){
    const isOpen = list.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  list.querySelectorAll('a').forEach(function(link){
    link.addEventListener('click', function(){
      list.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
})();

/* ---------- Scroll reveal ---------- */
(function initReveal(){
  const items = document.querySelectorAll('.reveal');
  if(!items.length) return;

  if(!('IntersectionObserver' in window)){
    items.forEach(function(el){ el.classList.add('in'); });
    return;
  }

  const observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  items.forEach(function(el){ observer.observe(el); });
})();

/* ---------- Footer year ---------- */
(function initFooterYear(){
  const el = document.querySelector('[data-year]');
  if(el) el.textContent = String(new Date().getFullYear());
})();


/* =========================================================
   ACADEMIC PLANNER
   Demonstrates: arrays, functions, DOM manipulation,
   event handling, dynamic content updates, localStorage
   ========================================================= */
(function initPlanner(){
  const form = document.getElementById('task-form');
  if(!form) return; // planner page only

  const STORAGE_KEY = 'oij-academic-planner-tasks';

  const titleInput = document.getElementById('task-title');
  const courseInput = document.getElementById('task-course');
  const dueInput = document.getElementById('task-due');
  const priorityInput = document.getElementById('task-priority');

  const todoList = document.getElementById('todo-list');
  const doneList = document.getElementById('done-list');
  const todoCount = document.getElementById('todo-count');
  const doneCount = document.getElementById('done-count');
  const todoEmpty = document.getElementById('todo-empty');
  const doneEmpty = document.getElementById('done-empty');
  const clearDoneBtn = document.getElementById('clear-done');

  /** @type {{id:string, title:string, course:string, due:string, priority:string, done:boolean}[]} */
  let tasks = loadTasks();

  // Seed a couple of example tasks on first-ever visit so the board isn't empty
  if(tasks.length === 0 && !localStorage.getItem(STORAGE_KEY + '-seeded')){
    tasks = [
      { id: makeId(), title: 'Finish COS 106 term project', course: 'COS 106', due: addDays(3), priority: 'high', done: false },
      { id: makeId(), title: 'Review Security+ Domain 3 notes', course: 'Security+', due: addDays(1), priority: 'medium', done: false },
      { id: makeId(), title: 'Submit Deft Rain internship log', course: 'Internship', due: addDays(-1), priority: 'low', done: true }
    ];
    saveTasks();
    localStorage.setItem(STORAGE_KEY + '-seeded', 'true');
  }

  render();

  form.addEventListener('submit', function(event){
    event.preventDefault();

    const title = titleInput.value.trim();
    if(!title){
      titleInput.focus();
      return;
    }

    const newTask = {
      id: makeId(),
      title: title,
      course: courseInput.value.trim() || 'General',
      due: dueInput.value || '',
      priority: priorityInput.value || 'medium',
      done: false
    };

    tasks.push(newTask); // array method: adding to the task collection
    saveTasks();
    render();
    form.reset();
    titleInput.focus();
  });

  if(clearDoneBtn){
    clearDoneBtn.addEventListener('click', function(){
      tasks = tasks.filter(function(t){ return !t.done; }); // array method: filter
      saveTasks();
      render();
    });
  }

  // Event delegation for complete / delete buttons on both lists
  [todoList, doneList].forEach(function(list){
    list.addEventListener('click', function(event){
      const btn = event.target.closest('button[data-action]');
      if(!btn) return;
      const id = btn.closest('.task-item').dataset.id;
      const action = btn.dataset.action;

      if(action === 'toggle') toggleTask(id);
      if(action === 'delete') deleteTask(id);
    });
  });

  function toggleTask(id){
    tasks = tasks.map(function(t){ // array method: map
      if(t.id === id) return Object.assign({}, t, { done: !t.done });
      return t;
    });
    saveTasks();
    render();
  }

  function deleteTask(id){
    tasks = tasks.filter(function(t){ return t.id !== id; }); // array method: filter
    saveTasks();
    render();
  }

  function render(){
    const pending = tasks.filter(function(t){ return !t.done; });
    const completed = tasks.filter(function(t){ return t.done; });

    todoList.innerHTML = '';
    doneList.innerHTML = '';

    pending
      .sort(sortByDueDate)
      .forEach(function(t){ todoList.appendChild(buildTaskElement(t)); });

    completed
      .sort(sortByDueDate)
      .forEach(function(t){ doneList.appendChild(buildTaskElement(t)); });

    todoCount.textContent = String(pending.length);
    doneCount.textContent = String(completed.length);

    todoEmpty.style.display = pending.length ? 'none' : 'block';
    doneEmpty.style.display = completed.length ? 'none' : 'block';
  }

  function buildTaskElement(task){
    const li = document.createElement('li');
    li.className = 'task-item' + (task.done ? ' done' : '') + (task.priority === 'high' && !task.done ? ' priority-high' : '');
    li.dataset.id = task.id;

    const dueLabel = task.due ? formatDate(task.due) : 'No due date';

    li.innerHTML =
      '<div class="task-body">' +
        '<div class="task-title">' + escapeHtml(task.title) + '</div>' +
        '<div class="task-meta">' + escapeHtml(task.course) + ' · ' + dueLabel + ' · ' + task.priority + ' priority</div>' +
      '</div>' +
      '<div class="task-actions">' +
        '<button type="button" class="icon-btn" data-action="toggle" aria-label="' + (task.done ? 'Mark as not done' : 'Mark as complete') + '">' + (task.done ? '↺' : '✓') + '</button>' +
        '<button type="button" class="icon-btn del" data-action="delete" aria-label="Delete task">✕</button>' +
      '</div>';

    return li;
  }

  function sortByDueDate(a, b){
    if(!a.due) return 1;
    if(!b.due) return -1;
    return new Date(a.due) - new Date(b.due);
  }

  function loadTasks(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      return [];
    }
  }

  function saveTasks(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    }catch(e){ /* storage unavailable — task list still works for this session */ }
  }

  function makeId(){
    return 't-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4).toString(36);
  }

  function addDays(n){
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function formatDate(iso){
    const d = new Date(iso + 'T00:00:00');
    if(isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
})();


/* =========================================================
   CONTACT FORM VALIDATION
   Demonstrates: event handling, form validation, DOM updates
   ========================================================= */
(function initContactForm(){
  const form = document.getElementById('contact-form');
  if(!form) return; // contact page only

  const status = document.getElementById('form-status');
  const fields = {
    name: document.getElementById('cf-name'),
    email: document.getElementById('cf-email'),
    phone: document.getElementById('cf-phone'),
    message: document.getElementById('cf-message')
  };

  const validators = {
    name: function(value){
      return value.trim().length >= 2 ? '' : 'Please enter your full name.';
    },
    email: function(value){
      const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return pattern.test(value.trim()) ? '' : 'Enter a valid email address, e.g. name@example.com.';
    },
    phone: function(value){
      const digitsOnly = /^[0-9]{7,15}$/;
      return digitsOnly.test(value.trim()) ? '' : 'Phone number must contain digits only (7–15 digits).';
    },
    message: function(value){
      return value.trim().length >= 10 ? '' : 'Message should be at least 10 characters.';
    }
  };

  Object.keys(fields).forEach(function(key){
    fields[key].addEventListener('blur', function(){ validateField(key); });
    fields[key].addEventListener('input', function(){
      // clear error state as the user corrects it
      const field = fields[key];
      if(field.closest('.field').classList.contains('invalid')){
        validateField(key);
      }
    });
  });

  form.addEventListener('submit', function(event){
    event.preventDefault();

    let isValid = true;
    Object.keys(fields).forEach(function(key){
      const ok = validateField(key);
      if(!ok) isValid = false;
    });

    if(!isValid){
      showStatus('Please fix the highlighted fields before sending.', 'error');
      const firstInvalid = form.querySelector('.field.invalid input, .field.invalid textarea');
      if(firstInvalid) firstInvalid.focus();
      return;
    }

    // No backend is connected in this template — simulate a successful send.
    showStatus('Thanks, ' + fields.name.value.trim().split(' ')[0] + '! Your message has been received. I\u2019ll reply within 1–2 business days.', 'success');
    form.reset();
    Object.keys(fields).forEach(function(key){
      fields[key].closest('.field').classList.remove('invalid');
      document.getElementById('err-' + key).textContent = '';
    });
  });

  function validateField(key){
    const field = fields[key];
    const message = validators[key](field.value);
    const wrapper = field.closest('.field');
    const errorEl = document.getElementById('err-' + key);

    if(message){
      wrapper.classList.add('invalid');
      errorEl.textContent = message;
      field.setAttribute('aria-invalid', 'true');
      return false;
    }
    wrapper.classList.remove('invalid');
    errorEl.textContent = '';
    field.setAttribute('aria-invalid', 'false');
    return true;
  }

  function showStatus(message, type){
    status.textContent = message;
    status.className = 'form-status show ' + type;
  }
})();

