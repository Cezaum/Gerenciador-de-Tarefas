document.addEventListener('DOMContentLoaded', () => {
    // --- SELETORES GLOBAIS ---
    const exportBtn = document.getElementById('export-btn');
    const importFile = document.getElementById('import-file');
    const themeToggle = document.getElementById('theme-toggle-checkbox');
    const datePicker = document.getElementById('date-picker-input');
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    const views = document.querySelectorAll('.view');
    const viewTitle = document.getElementById('view-title');
    
    const newTaskForm = document.getElementById('new-task-form');
    const newTaskInput = document.getElementById('new-task-input');
    const newTaskDescription = document.getElementById('new-task-description');
    const taskTypeSelect = document.getElementById('task-type-select');
    const taskTagSelect = document.getElementById('task-tag-select');
    const taskList = document.getElementById('task-list');

    const calendarGrid = document.getElementById('calendar-grid');
    const monthYearDisplay = document.getElementById('month-year-display');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');

    const statsContainer = document.getElementById('stats-container');
    const dailyCountersContainer = document.getElementById('daily-counters');
    
    const modal = document.getElementById('task-modal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');

    // --- ESTADO DA APLICAÇÃO ---
    let db;
    let selectedDate = new Date();
    let calendarDate = new Date();

    // --- FUNÇÃO DE CARREGAMENTO (localStorage) ---
    const loadData = () => {
        try {
            const savedDB = localStorage.getItem('deliveryControlDB');
            db = savedDB ? JSON.parse(savedDB) : { templates: [], instances: [] };
            if (!db.templates) db.templates = [];
            if (!db.instances) db.instances = [];
        } catch (error) {
            console.error("Erro ao carregar dados do localStorage. Resetando para uma base limpa.", error);
            db = { templates: [], instances: [] };
        }
    };

    // --- FUNÇÃO DE SALVAMENTO (localStorage) ---
    const saveData = () => {
        try {
            localStorage.setItem('deliveryControlDB', JSON.stringify(db));
        } catch (error) {
            console.error("Erro ao salvar dados no localStorage:", error);
            alert("Não foi possível salvar os dados. O armazenamento pode estar cheio.");
        }
    };

    // --- FUNÇÕES DE IMPORTAR/EXPORTAR DADOS ---
    const exportData = () => {
        const dataStr = JSON.stringify(db, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup_control_desk_${formatDate(new Date(), 'iso')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const importData = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!confirm("Tem certeza que deseja importar este arquivo? Todos os dados atuais serão substituídos pelo conteúdo do backup.")) {
            event.target.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedDB = JSON.parse(e.target.result);
                if (importedDB && Array.isArray(importedDB.templates) && Array.isArray(importedDB.instances)) {
                    db = importedDB;
                    saveData();
                    alert('Dados importados com sucesso!');
                    generateDailyInstances();
                    showView('tasks-view');
                } else {
                    alert('Erro: O arquivo selecionado não parece ser um backup válido.');
                }
            } catch (error) {
                alert('Erro ao ler o arquivo. Verifique se é um JSON válido.');
                console.error("Erro no parse do JSON:", error);
            } finally {
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    };
    
    exportBtn.addEventListener('click', exportData);
    importFile.addEventListener('change', importData);

    // --- LÓGICA DE TEMA ---
    const applyTheme = (theme) => {
        document.body.classList.remove('dark-theme', 'light-theme');
        document.body.classList.add(theme);
        localStorage.setItem('theme', theme);
        themeToggle.checked = theme === 'dark-theme';
    };
    themeToggle.addEventListener('change', () => {
        applyTheme(themeToggle.checked ? 'dark-theme' : 'light-theme');
    });

    // --- NAVEGAÇÃO E VISUALIZAÇÃO ---
    const showView = (viewId) => {
        views.forEach(view => view.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        navLinks.forEach(link => link.classList.toggle('active', link.dataset.view === viewId));
        switch (viewId) {
            case 'tasks-view': updateHeader(); renderTaskInstancesForDate(selectedDate); break;
            case 'calendar-view': renderCalendar(); break;
            case 'stats-view': renderStats(); break;
        }
    };
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => { e.preventDefault(); showView(e.currentTarget.dataset.view); });
    });
    const updateHeader = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        viewTitle.textContent = selectedDate.toDateString() === today.toDateString() ? 'Tarefas para hoje' : `Tarefas para ${formatDate(selectedDate, 'long')}`;
        datePicker.value = formatDate(selectedDate, 'iso');
    };
    datePicker.addEventListener('change', (e) => {
        const [year, month, day] = e.target.value.split('-').map(Number);
        selectedDate = new Date(year, month - 1, day);
        showView('tasks-view');
    });

    // --- LÓGICA DE DADOS (MODELOS E INSTÂNCIAS) ---
    const generateDailyInstances = () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let wasModified = false;
        db.templates.forEach(template => {
            if (!template.isActive) return;
            const startDate = new Date(template.startDate);
            startDate.setHours(0, 0, 0, 0);
            if (template.type === 'diaria' && today >= startDate) {
                const instanceId = `${template.id}_${formatDate(today, 'iso')}`;
                if (!db.instances.some(inst => inst.id === instanceId)) {
                    db.instances.push({
                        id: instanceId, templateId: template.id, dueDate: today.toISOString(),
                        completed: false, completedAt: null,
                    });
                    wasModified = true;
                }
            }
        });
        if (wasModified) saveData();
    };

    // --- LÓGICA DE TAREFAS ---
    const renderTaskInstancesForDate = (date) => {
        taskList.innerHTML = '';
        const instancesForDay = db.instances.filter(inst => new Date(inst.dueDate).toDateString() === date.toDateString());
        if (instancesForDay.length === 0) {
            taskList.innerHTML = `<p style="text-align:center; color:var(--light-text-color);">Nenhuma tarefa para esta data.</p>`;
        } else {
            instancesForDay.forEach(instance => {
                const template = db.templates.find(t => t.id === instance.templateId);
                if (!template) return;
                const taskItem = document.createElement('li');
                taskItem.className = `task-item ${instance.completed ? 'completed' : ''}`;
                taskItem.dataset.instanceId = instance.id;
                taskItem.dataset.templateId = template.id;
                taskItem.dataset.tag = template.tag;
                taskItem.innerHTML = `<div class="task-content"><span class="task-text">${template.text}</span>${template.tag !== 'geral' ? `<span class="task-tag ${template.tag}">${template.tag.toUpperCase()}</span>` : ''}</div><div class="task-actions"><button class="complete-btn" title="Concluir Tarefa"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"></path></svg></button><button class="delete-btn" title="${template.type === 'diaria' ? 'Descontinuar Demanda' : 'Excluir Tarefa'}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg></button></div>`;
                taskList.appendChild(taskItem);
            });
        }
        renderDailyCounters(date);
    };
    newTaskForm.addEventListener('submit', e => {
        e.preventDefault();
        const text = newTaskInput.value.trim();
        if (!text) return;
        const newTemplate = { id: Date.now(), text: text, description: newTaskDescription.value.trim(), tag: taskTagSelect.value, type: taskTypeSelect.value, startDate: selectedDate.toISOString(), endDate: null, isActive: true, };
        db.templates.push(newTemplate);
        if (newTemplate.type === 'unica') { db.instances.push({ id: `${newTemplate.id}_${formatDate(selectedDate, 'iso')}`, templateId: newTemplate.id, dueDate: selectedDate.toISOString(), completed: false, completedAt: null, }); }
        saveData();
        generateDailyInstances();
        showView('tasks-view');
        newTaskForm.reset();
    });
    taskList.addEventListener('click', e => {
        const taskItem = e.target.closest('.task-item');
        if (!taskItem) return;
        const instance = db.instances.find(i => i.id === taskItem.dataset.instanceId);
        const template = db.templates.find(t => t.id === Number(taskItem.dataset.templateId));
        if (e.target.closest('.complete-btn')) {
            if (instance) { instance.completed = !instance.completed; instance.completedAt = instance.completed ? new Date().toISOString() : null; }
        } else if (e.target.closest('.delete-btn')) {
            if (template.type === 'diaria') {
                if (confirm('Você tem certeza que deseja descontinuar esta demanda?')) { template.isActive = false; template.endDate = new Date().toISOString(); }
            } else {
                if (confirm('Você tem certeza que deseja excluir esta tarefa única?')) {
                    db.instances = db.instances.filter(i => i.id !== instance.id);
                    if (!db.instances.some(i => i.templateId === template.id)) db.templates = db.templates.filter(t => t.id !== template.id);
                }
            }
        } else { openModal(template); }
        saveData();
        renderTaskInstancesForDate(selectedDate);
    });

    // --- MODAL ---
    const openModal = (template) => { if (!template) return; document.getElementById('modal-task-title').textContent = template.text; document.getElementById('modal-task-tag').textContent = `Tag: ${template.tag.toUpperCase()}`; document.getElementById('modal-task-description').textContent = template.description || "Nenhuma descrição fornecida."; modal.classList.remove('hidden'); };
    const closeModal = () => modal.classList.add('hidden');
    modalCloseBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // --- CALENDÁRIO VISUAL ---
    const renderCalendar = () => {
        calendarGrid.innerHTML = ''; calendarDate.setDate(1); const month = calendarDate.getMonth(), year = calendarDate.getFullYear();
        monthYearDisplay.textContent = `${calendarDate.toLocaleDateString('pt-BR', { month: 'long' })} ${year}`;
        const firstDayIndex = calendarDate.getDay(), lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        for (let i = 0; i < firstDayIndex; i++) { calendarGrid.innerHTML += `<div class="calendar-day other-month"></div>`; }
        for (let i = 1; i <= lastDayOfMonth; i++) {
            const dayDiv = document.createElement('div'); dayDiv.classList.add('calendar-day'); const dayDate = new Date(year, month, i);
            dayDiv.innerHTML = `<div class="day-number">${i}</div><div class="day-stats"></div>`;
            if (dayDate.toDateString() === new Date().toDateString()) dayDiv.classList.add('current-day');
            const dayInstances = db.instances.filter(inst => new Date(inst.dueDate).toDateString() === dayDate.toDateString());
            if (dayInstances.length > 0) {
                const completedCount = dayInstances.filter(inst => inst.completed).length;
                const pendingCount = dayInstances.length - completedCount;
                const statsDiv = dayDiv.querySelector('.day-stats');
                if (completedCount > 0) statsDiv.innerHTML += `<span class="stat-completed">✔ ${completedCount}</span>`;
                if (pendingCount > 0) statsDiv.innerHTML += `<span class="stat-pending">❗ ${pendingCount}</span>`;
            }
            dayDiv.addEventListener('click', () => { selectedDate = dayDate; showView('tasks-view'); });
            calendarGrid.appendChild(dayDiv);
        }
    };
    prevMonthBtn.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderCalendar(); });
    nextMonthBtn.addEventListener('click', () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderCalendar(); });
    
    // --- ESTATÍSTICAS E CONTADORES ---
    const renderDailyCounters = (date) => {
        const instancesForDay = db.instances.filter(inst => new Date(inst.dueDate).toDateString() === date.toDateString());
        const completed = instancesForDay.filter(i => i.completed).length;
        dailyCountersContainer.innerHTML = `<div class="counter-card"><span style="color:var(--success-color);">${completed}</span><p>Concluídas</p></div> <div class="counter-card"><span style="color:var(--tag-sql);">${instancesForDay.length - completed}</span><p>Pendentes</p></div> <div class="counter-card"><span>${instancesForDay.length}</span><p>Total</p></div>`;
    };
    const renderStats = () => {
        const totalCompleted = db.instances.filter(i => i.completed).length; const adherence = db.instances.length > 0 ? ((totalCompleted / db.instances.length) * 100).toFixed(0) : 0;
        const tagsCount = db.templates.reduce((acc, t) => { acc[t.tag] = (acc[t.tag] || 0) + 1; return acc; }, {});
        const stats = [{ title: 'Total de Demandas', value: db.templates.length, color: 'var(--primary-color)' }, { title: 'Ocorrências Concluídas', value: totalCompleted, color: 'var(--success-color)' }, { title: 'Ocorrências Pendentes', value: db.instances.length - totalCompleted, color: 'var(--tag-sql)' }, { title: 'Adesão Geral', value: `${adherence}%`, color: 'var(--secondary-color)' }];
        let statsHTML = ''; stats.forEach(s => { statsHTML += `<div class="stat-card" style="border-color:${s.color};"><h3>${s.title}</h3><p class="stat-value">${s.value}</p></div>`; });
        let tagDetailsHTML = '<div class="stat-card" style="grid-column: 1 / -1; border-color: var(--border-color);"><h3>Demandas por Tag</h3><p class="stat-details">';
        for (const tag in tagsCount) { tagDetailsHTML += `<b>${tag.toUpperCase()}:</b> ${tagsCount[tag]} demandas<br>`; }
        tagDetailsHTML += '</p></div>';
        statsContainer.innerHTML = statsHTML + tagDetailsHTML;
    };
    
    // --- UTILITÁRIOS ---
    const formatDate = (date, format = 'long') => {
        const year = date.getFullYear(); const month = String(date.getMonth() + 1).padStart(2, '0'); const day = String(date.getDate()).padStart(2, '0');
        if (format === 'iso') return `${year}-${month}-${day}`;
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    // --- INICIALIZAÇÃO ---
    loadData();
    const savedTheme = localStorage.getItem('theme') || 'dark-theme';
    applyTheme(savedTheme);
    generateDailyInstances();
    showView('tasks-view');
});