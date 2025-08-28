// Android версия SEPO — Система сертифікації продукції

// Українські переклади ролей
const roleTranslations = {
	applicant: 'Заявник',
	operator: 'Оператор', 
	inspector: 'Інспектор',
	admin: 'Адміністратор'
}

// Українські переклади статусів
const statusTranslations = {
	'new': 'Нова',
	'docs_submitted': 'Документи подано',
	'docs_reviewed': 'Документи переглянуто',
	'changes_requested': 'Запитано зміни',
	'docs_approved': 'Документи затверджено',
	'inspection_requested': 'Запитано інспекцію',
	'inspection_planned': 'Інспекцію заплановано',
	'inspection_in_progress': 'Інспекція в процесі',
	'inspection_completed': 'Інспекцію завершено',
	'inspection_denied': 'Інспекцію відхилено',
	'certification_tests': 'Тестування сертифікації',
	'protocols_issued': 'Протоколи видано',
	'results_analyzed': 'Результати проаналізовано',
	'fixes_submitted': 'Виправлення подано',
	'certificate_generated': 'Сертифікат згенеровано',
	'contract_signed': 'Договір підписано',
	'registered': 'Зареєстровано',
	'completed': 'Завершено'
}

// API endpoints (для локального сервера)
const API_BASE = 'https://sepo-certification-api.onrender.com'

function buildUrl(pathOrUrl) {
	if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
	return `${API_BASE}${pathOrUrl}`
}

const API = {
	login: '/api/login',
	me: '/api/me',
	apps: '/api/applications',
	app: id => `/api/applications/${id}`,
	upload: id => `/api/applications/${id}/upload`,
	submitDocs: id => `/api/applications/${id}/submit-docs`,
	analyzeDocs: id => `/api/applications/${id}/analyze-docs`,
	preDecision: id => `/api/applications/${id}/pre-tests-decision`,
	runCertificationTests: id => `/api/applications/${id}/run-certification-tests`,
	issueProtocols: id => `/api/applications/${id}/issue-protocols`,
	analyzeResults: id => `/api/applications/${id}/analyze-results`,
	submitFixes: id => `/api/applications/${id}/submit-fixes`,
	generateCert: id => `/api/applications/${id}/generate-certificate`,
	signContract: id => `/api/applications/${id}/sign-contract`,
	continueProcess: id => `/api/applications/${id}/continue-process`,
	register: id => `/api/applications/${id}/register`,
	deleteApp: id => `/api/applications/${id}`,
	planInsp: id => `/api/applications/${id}/plan-inspection`,
	inspections: '/api/inspections',
	completeInsp: id => `/api/inspections/${id}/complete`,
	cancelInsp: id => `/api/inspections/${id}/cancel`,
	logs: '/api/logs',
	clearLogs: '/api/logs/clear',
	adminForce: '/api/admin/force-state',
	users: '/api/users',
	createUser: '/api/users',
	changePassword: id => `/api/users/${id}/password`,
	changeRole: id => `/api/users/${id}/role`,
	changeUserName: id => `/api/users/${id}/name`,
	changeUserEmail: id => `/api/users/${id}/email`,
	changeUserId: id => `/api/users/${id}/id`,
	deleteUser: id => `/api/users/${id}`,
	logout: '/api/logout',
}

// Состояние приложения
let token = localStorage.getItem('token') || null
let currentUser = null
let userInfoRefreshTimerId = null

// DOM вспомогательные функции
const $ = id => {
    const element = document.getElementById(id)
    if (!element) {
        console.warn('Element not found:', id)
    }
    return element
}

const show = el => {
    if (el) {
        el.style.display = 'block'
        console.log('Element shown:', el.id || 'unknown element')
    } else {
        console.log('Attempted to show null/undefined element')
    }
}

const hide = el => {
    if (el) {
        el.style.display = 'none'
        console.log('Element hidden:', el.id || 'unknown element')
    } else {
        console.log('Attempted to hide null/undefined element')
    }
}

// Функция для показа уведомлений
const showNotification = (message, type = 'info') => {
    // Создаем уведомление
    const notification = document.createElement('div')
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc3545' : '#28a745'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 1000;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `
    notification.textContent = message
    
    document.body.appendChild(notification)
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification)
        }
    }, 3000)
}

// HTTP запросы
const apiRequest = async (pathOrUrl, options = {}) => {
    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        ...options
    }
    if (token) config.headers.Authorization = `Bearer ${token}`
    const url = buildUrl(pathOrUrl)
    const response = await fetch(url, config)
    if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`HTTP ${response.status} ${text}`)
    }
    return await response.json()
}

// Авторизация
const login = async (email, password) => {
    const submitBtn = document.querySelector('#login-form button[type="submit"]')
    const prevText = submitBtn ? submitBtn.textContent : ''
    if (submitBtn) {
        submitBtn.disabled = true
        submitBtn.textContent = 'Вхід...'
    }
    try {
        const response = await apiRequest(API.login, {
            method: 'POST',
            body: JSON.stringify({ email, password })
        })
        
        if (response.token) {
            token = response.token
            localStorage.setItem('token', token)
            currentUser = response.user
            showNotification('Успішний вхід в систему')
            showApp()
            startUserInfoRefresh()
        } else {
            showNotification('Невірний email або пароль', 'error')
        }
    } catch (error) {
        showNotification('Помилка входу в систему', 'error')
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false
            submitBtn.textContent = prevText
        }
    }
}

// Получение информации о пользователе
const getUserInfo = async () => {
    try {
        const user = await apiRequest(API.me)
        currentUser = user
        updateUserInfo()
    } catch (error) {
        console.error('Failed to get user info:', error)
    }
}

// Обновление информации о пользователе в UI
const updateUserInfo = () => {
    const userInfo = $('user-info')
    if (userInfo && currentUser) {
        userInfo.textContent = `${currentUser.name} (${roleTranslations[currentUser.role]})`
    }
}

// Показ основного приложения
const setRoleBasedVisibility = () => {
    const role = currentUser?.role || 'applicant'

    const controls = {
        create: $('nav-create'),
        my: $('nav-my'),
        all: $('nav-all'),
        ins: $('nav-ins'),
        insHistory: $('nav-ins-history'),
        insPending: $('nav-ins-pending'),
        insPlanned: $('nav-ins-planned'),
        logs: $('nav-logs'),
        users: $('nav-users'),
    }

    const cards = {
        create: $('create-card'),
        list: $('list-card'),
        detail: $('detail-card'),
        ins: $('inspections-card'),
        insHistory: $('inspections-history-card'),
        insPending: $('inspections-pending-card'),
        insPlanned: $('inspections-planned-card'),
        logs: $('logs-card'),
        users: $('users-card'),
    }

    const hideAll = () => {
        Object.values(controls).forEach(hide)
        Object.values(cards).forEach(hide)
    }

    hideAll()

    if (role === 'applicant') {
        show(controls.create)
        show(controls.my)
        show(cards.create)
        show(cards.list)
    } else if (role === 'inspector') {
        show(controls.ins)
        show(controls.insHistory)
        show(controls.insPending)
        show(controls.insPlanned)
        show(cards.ins)
        show(cards.insHistory)
        show(cards.insPending)
        show(cards.insPlanned)
    } else if (role === 'operator') {
        show(controls.all)
        show(cards.list)
    } else if (role === 'admin') {
        Object.values(controls).forEach(show)
        Object.values(cards).forEach(show)
    } else {
        // fallback: показываем только список
        show(controls.my)
        show(cards.list)
    }
}

const showApp = () => {
    hide($('login-card'))
    show($('app-area'))
    setRoleBasedVisibility()
    loadApplications()
}

// Загрузка заявок
const loadApplications = async () => {
    try {
        const applications = await apiRequest(API.apps)
        displayApplications(applications)
    } catch (error) {
        showNotification('Помилка завантаження заявок', 'error')
    }
}

// Отображение заявок
const displayApplications = (applications) => {
    const appsContainer = $('apps')
    if (!appsContainer) return
    
    appsContainer.innerHTML = ''
    
    if (applications.length === 0) {
        appsContainer.innerHTML = '<p class="muted">Заявок не знайдено</p>'
        return
    }
    
    applications.forEach(app => {
        const appElement = document.createElement('div')
        appElement.className = 'list-item'
        appElement.innerHTML = `
            <div>
                <div class="title">${app.productName}</div>
                <div class="muted">Заявка #${app.id}</div>
                <div class="state">${statusTranslations[app.status] || app.status}</div>
            </div>
            <button class="btn" onclick="viewApplication(${app.id})">Переглянути</button>
        `
        appsContainer.appendChild(appElement)
    })
}

// Просмотр заявки
const viewApplication = async (id) => {
    try {
        const app = await apiRequest(API.app(id))
        displayApplicationDetails(app)
        show($('detail-card'))
        hide($('list-card'))
        hide($('create-card'))
    } catch (error) {
        showNotification('Помилка завантаження заявки', 'error')
    }
}

// Отображение деталей заявки
const displayApplicationDetails = (app) => {
    const appNumber = $('app-number')
    const appStatus = $('app-status')
    const appDetails = $('app-details')
    
    if (appNumber) appNumber.textContent = `Заявка #${app.id}`
    if (appStatus) appStatus.textContent = statusTranslations[app.status] || app.status
    
    if (appDetails) {
        appDetails.innerHTML = `
            <div class="form-group">
                <label>Назва продукції:</label>
                <div>${app.productName}</div>
            </div>
            <div class="form-group">
                <label>Тип продукції:</label>
                <div>${app.productType}</div>
            </div>
            <div class="form-group">
                <label>Заявник:</label>
                <div>${app.applicantType}</div>
            </div>
            <div class="form-group">
                <label>Статус:</label>
                <div class="state">${statusTranslations[app.status] || app.status}</div>
            </div>
            <div class="actions">
                <button class="btn" onclick="loadApplications()">Назад до списку</button>
            </div>
        `
    }
}

// Создание новой заявки
const createApplication = async (formData) => {
    try {
        const response = await apiRequest(API.apps, {
            method: 'POST',
            body: JSON.stringify(formData)
        })
        
        showNotification('Заявку створено успішно')
        loadApplications()
        show($('list-card'))
        hide($('create-card'))
    } catch (error) {
        showNotification('Помилка створення заявки', 'error')
    }
}

// Выход из системы
const logout = async () => {
    try {
        await apiRequest(API.logout, { method: 'POST' })
    } catch (error) {
        console.error('Logout error:', error)
    }
    
    token = null
    currentUser = null
    localStorage.removeItem('token')
    
    if (userInfoRefreshTimerId) {
        clearInterval(userInfoRefreshTimerId)
        userInfoRefreshTimerId = null
    }
    
    show($('login-card'))
    hide($('app-area'))
    showNotification('Ви вийшли з системи')
}

// Запуск обновления информации о пользователе
const startUserInfoRefresh = () => {
    if (userInfoRefreshTimerId) {
        clearInterval(userInfoRefreshTimerId)
    }
    userInfoRefreshTimerId = setInterval(getUserInfo, 30000) // каждые 30 секунд
}

// Функция для переключения поля "другое"
const toggleOtherField = () => {
    const applicantType = $('applicantType')
    const otherField = $('otherField')
    
    if (applicantType && otherField) {
        if (applicantType.value === 'інше') {
            show(otherField)
        } else {
            hide(otherField)
        }
    }
}

// Инициализация приложения
const initApp = () => {
    // Обработчики событий для формы входа
    const loginForm = $('login-form')
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault()
            const email = $('email').value
            const password = $('password').value
            await login(email, password)
        })
    }
    
    // Обработчики событий для навигации
    const navCreate = $('nav-create')
    if (navCreate) {
        navCreate.addEventListener('click', () => {
            show($('create-card'))
            hide($('list-card'))
            hide($('detail-card'))
        })
    }
    
    const navMy = $('nav-my')
    if (navMy) {
        navMy.addEventListener('click', () => {
            show($('list-card'))
            hide($('create-card'))
            hide($('detail-card'))
            loadApplications()
        })
    }
    
    const navAll = $('nav-all')
    if (navAll) {
        navAll.addEventListener('click', () => {
            show($('list-card'))
            hide($('create-card'))
            hide($('detail-card'))
            loadApplications()
        })
    }
    
    // Обработчик для формы создания заявки
    const createForm = $('create-form')
    if (createForm) {
        createForm.addEventListener('submit', async (e) => {
            e.preventDefault()
            const formData = {
                productName: $('productName').value,
                productType: $('productType').value,
                applicantType: $('applicantType').value === 'інше' ? $('otherApplicantType').value : $('applicantType').value
            }
            await createApplication(formData)
        })
    }
    
    // Обработчик для выхода
    const logoutBtn = $('logout')
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout)
    }
    
    // Проверяем, есть ли сохраненный токен
    if (token) {
        getUserInfo().then(() => {
            showApp()
        }).catch(() => {
            // Если токен недействителен, показываем форму входа
            token = null
            localStorage.removeItem('token')
            show($('login-card'))
            hide($('app-area'))
        })
    } else {
        show($('login-card'))
        hide($('app-area'))
    }
}

// Запуск приложения когда DOM загружен
document.addEventListener('DOMContentLoaded', initApp)
