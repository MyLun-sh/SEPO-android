// public/app.js — Система сертифікації продукції

// Українські переклади ролей
const roleTranslations = {
	applicant: 'Заявник',
	operator: 'Оператор', 
	inspector: 'Інспектор',
	admin: 'Адміністратор'
}

// Українські переклади назв дій
const actionNamesUA = {
	'create_application': 'Створити заявку',
	'submit_documents': 'Подати документи',
	'review_documents': 'Переглянути документи',
	'request_changes': 'Запитати зміни',
	'approve_documents': 'Затвердити документи',
	'request_inspection': 'Запитати інспекцію',
	'plan_inspection': 'Запланувати інспекцію',
	'conduct_inspection': 'Провести інспекцію',
	'complete_inspection': 'Завершити інспекцію',
	'deny_inspection': 'Відхилити інспекцію',
	'generate_certificate': 'Згенерувати сертифікат',
	'register_certificate': 'Зареєструвати сертифікат',
	'sign_contract': 'Підписати договір',
	'request_reinspection': 'Запитати повторну інспекцію',
	'admin_force': 'Примусова зміна (адмін)',
	'issue_protocols': 'Видати протоколи',
	'fix_errors': 'Виправити помилки',
	'upload_file': 'Завантажити файл',
	'submit_fixes': 'Відправити виправлення'
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
  serialPreEval: id => `/api/applications/${id}/serial-pre-eval`,

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
	samplingData: id => `/api/applications/${id}/sampling-data`,
	certificationData: id => `/api/applications/${id}/certification-data`,
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

// стан
let token = localStorage.getItem('token') || null
let currentUser = null
let userInfoRefreshTimerId = null
// Відстеження завантажень на заявку в поточній сесії (для показу кнопки submit-fix)
const sessionUploads = {}
const sessionFileUploadedForFix = {}

// DOM допоміжні функції
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

function headersJSON() {
	const h = { 'Content-Type': 'application/json' }
	if (token) h['Authorization'] = `Bearer ${token}`
	return h
}

async function call(path, opts = {}) {
	const headers = opts.headers || {}
	if (token) headers['Authorization'] = `Bearer ${token}`
	const res = await fetch(path, { ...opts, headers })
	if (res.status === 401) {
		logoutLocal()
		alert('Сесія закінчилась — увійдіть ще раз')
		throw new Error('Unauthorized')
	}
	let json = {}
	try {
		json = await res.json()
	} catch (e) {}
	if (!res.ok) {
		const err = json && json.error ? json.error : `HTTP ${res.status}`
		throw new Error(err)
	}
	return json
}

// UI елементи
const loginCard = $('login-card')
const loginForm = $('login-form')
const email = $('email')
const password = $('password')
const userInfo = $('user-info')
const logoutBtn = $('logout')



const navCreate = $('nav-create')
const navMy = $('nav-my')
const navAll = $('nav-all')
const navIns = $('nav-ins')
const navInsHistory = $('nav-ins-history')
const navLogs = $('nav-logs')
const navInsPending = $('nav-ins-pending') // Новий елемент навігації
const navInsPlanned = $('nav-ins-planned') // Новий елемент навігації для запланованих інспекцій
const navUsers = $('nav-users')

const appArea = $('app-area')
const createCard = $('create-card')
const listCard = $('list-card')
const detailCard = $('detail-card')
const insCard = $('ins-card')
const insPendingCard = $('ins-pending-card')
const insPlannedCard = $('ins-planned-card') // Нова картка для запланованих інспекцій
const insHistoryCard = $('ins-history-card')


const insList = $('ins-list')
const insPendingList = $('ins-pending-list') // Додаємо відсутній елемент
const insPlannedList = $('ins-planned-list') // Новий елемент для запланованих інспекцій
const insHistoryList = $('ins-history-list') // Відновлюю відсутній елемент
const insCreate = $('ins-create')
const insApp = $('ins-app')
const insDate = $('ins-date')
const insResp = $('ins-resp')
const insNotes = $('ins-notes')
const insType = $('ins-type')
const insOrder = $('ins-order')

const createForm = $('create-form')
const appsDiv = $('apps')
const appNumber = $('app-number')
const appState = $('app-state')
const stepper = $('stepper')
const detailContent = $('detail-content')
const actionsDiv = $('actions')



const logsCard = $('logs-card')
const usersCard = $('users-card')
const logsArea = $('logs-area')

// Українські назви станів згідно з алгоритмом
const stepNamesUA = {
	draft: 'Чернетка',
	submitted_docs: 'Документи подані',
	doc_analysis: 'Аналіз документації',
	doc_corrections: 'Усунення недоліків',
	pre_tests_decision: 'Прийняття рішення за заявкою',
	sampling_and_tests: 'Відбирання зразків та їх ідентифікація',
	certification_tests: 'Випробування з метою сертифікації',
	test_protocols: 'Видача протоколів випробувань',
	tests_analysis: 'Аналіз результатів сертифікаційних робіт',
	nonconformities: 'Усунення невідповідностей',
	approved: 'Схвалено',
	certificate_generated: 'Видача сертифіката відповідності',
	contract_signed: 'Укладання сертифікаційного договору (тільки партія/серійна)',
	registered: 'Реєстрація в Реєстрі Системи УкрСЕПРО',
	awaiting_inspection: 'Очікування інспекції',
	inspection_planned: 'Інспектування сертифікованої продукції (заплановано)',
	inspection_completed: 'Інспектування сертифікованої продукції (проведено)',
	inspection_denied: 'Інспекцію відхилено',
	closed: 'Закрито',
}

// Визначаємо рекомендовані строки сертифікатів
function getRecommendedValidity(productType, testKeys = []) {
	if (productType === 'одиничний') return 1
	if (productType === 'партія') return 2
	if (productType === 'серійна') {
		if (testKeys.includes('management_system')) return 5
		if (testKeys.includes('production_attestation')) return 3
		return 3
	}
	return 1
}

// Очищення форми створення
function clearCreateForm() {
	const productName = document.getElementById('productName')
	const productType = document.getElementById('productType')
	const applicantType = document.getElementById('applicantType')
	const otherApplicantType = document.getElementById('otherApplicantType')
	const otherField = document.getElementById('otherField')
	
	if (productName) productName.value = ''
	if (productType) productType.value = 'одиничний'
	if (applicantType) applicantType.value = 'виробник'
	if (otherApplicantType) otherApplicantType.value = ''
	if (otherField) otherField.style.display = 'none'
}

// Очищення змінних сесії при переключенні заявок
function clearSessionVariables() {
	Object.keys(sessionUploads).forEach(key => delete sessionUploads[key])
	Object.keys(sessionFileUploadedForFix).forEach(key => delete sessionFileUploadedForFix[key])
}

// Переключення поля "інше" для типу заявника
function toggleOtherField() {
	const applicantType = document.getElementById('applicantType')
	const otherField = document.getElementById('otherField')
	const otherInput = document.getElementById('otherApplicantType')
	
	if (!applicantType || !otherField || !otherInput) return
	
	if (applicantType.value === 'інше') {
		otherField.style.display = 'block'
		otherInput.required = true
	} else {
		otherField.style.display = 'none'
		otherInput.required = false
		otherInput.value = ''
	}
}

// Запис дії в журнал
function logAction(action, applicationId = null, details = null) {
	const timestamp = new Date().toLocaleString('uk-UA')
	const user = currentUser ? `${currentUser.role} (${currentUser.id})` : 'Unknown'
	const appInfo = applicationId ? ` | Заявка: ${applicationId}` : ''
	const detailInfo = details ? ` | ${details}` : ''
	
	const logEntry = `[${timestamp}] ${user}${appInfo} | ${action}${detailInfo}`
	
	// Додаємо в журнал дій якщо він відкритий
	const logsArea = document.getElementById('logs-area')
	if (logsArea) {
		const logDiv = document.createElement('div')
		logDiv.textContent = logEntry
		logsArea.appendChild(logDiv)
		logsArea.scrollTop = logsArea.scrollHeight
	}
}

// Ініціалізація
;(async function init() {
	console.log('Initializing application...') // Відладочна інформація
	if (token) {
		console.log('Token found, attempting to restore session') // Відладочна інформація
		try {
			const me = await call(API.me)
			currentUser = me.user
			console.log('Session restored for user:', currentUser.role) // Відладочна інформація
			afterLogin()
		} catch (e) {
			console.log('Session restore failed, clearing token') // Відладочна інформація
			token = null
			localStorage.removeItem('token')
			if (loginCard) show(loginCard)
			if (appArea) hide(appArea)
		}
	} else {
		console.log('No token found, showing login form') // Відладочна інформація
		if (loginCard) show(loginCard)
		if (appArea) hide(appArea)
	}
	console.log('Initialization completed') // Відладочна інформація
	
	// Додаткова відладочна інформація після ініціалізації
	console.log('DOM elements after init:', {
		loginCard: !!loginCard,
		appArea: !!appArea,
		createCard: !!createCard,
		listCard: !!listCard,
		detailCard: !!detailCard,
		insCard: !!insCard,
		insPendingCard: !!insPendingCard,
		insPlannedCard: !!insPlannedCard,
		insHistoryCard: !!insHistoryCard,
		logsCard: !!logsCard
	})
})()

// Авторизація
if (loginForm) {
    loginForm.addEventListener('submit', async e => {
        e.preventDefault()
        console.log('Login form submitted') // Відладочна інформація
        try {
            const res = await fetch(API.login, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.value.trim(),
                    password: password.value.trim(),
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                alert(data.error || 'Помилка входу')
                return
            }
            			console.log('Login successful, user:', data.user.role) // Відладочна інформація
            token = data.token
            localStorage.setItem('token', token)
            currentUser = data.user
            afterLogin()
        } catch (err) {
            console.error('Login error:', err) // Відладочна інформація
            alert(err.message || 'Помилка')
        }
    })
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await fetch(API.logout, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
            })
        } catch (e) {}
        logoutLocal()
    })
}

function logoutLocal() {
	        console.log('Logging out locally') // Відладочна інформація
	token = null
	currentUser = null
    if (userInfoRefreshTimerId) {
        clearInterval(userInfoRefreshTimerId)
        userInfoRefreshTimerId = null
    }
	localStorage.removeItem('token')
	// Очищення змінних сесії для запобігання проблем зі збереженням стану
	Object.keys(sessionUploads).forEach(key => delete sessionUploads[key])
	Object.keys(sessionFileUploadedForFix).forEach(key => delete sessionFileUploadedForFix[key])
	
	if (loginCard) show(loginCard)
	if (userInfo) hide(userInfo)
	if (appArea) hide(appArea)
	console.log('Logout completed') // Відладочна інформація
}

// Після входу
function afterLogin() {
    console.log('afterLogin called') // Відладочна інформація
    
    if (loginCard) {
        hide(loginCard)
        console.log('loginCard hidden')
    }
    
    if (appArea) {
        show(appArea)
        console.log('appArea shown')
        console.log('appArea children:', appArea.children.length, 'elements')
        console.log('appArea innerHTML length:', appArea.innerHTML.length)
    } else {
        console.error('appArea not found!')
    }
    
    // Забезпечення того, щоб роль/ім'я користувача завжди було видимим після входу без перезавантаження сторінки
    if (userInfo) show(userInfo)
    updateUserInfoDisplay()
    // Періодичне оновлення інформації користувача щоб зміни ролей на сервері відображалися без перезавантаження
    if (userInfoRefreshTimerId) clearInterval(userInfoRefreshTimerId)
    userInfoRefreshTimerId = setInterval(updateUserInfoDisplay, 15000)
    if (logoutBtn) show(logoutBtn)
    
    console.log('User role:', currentUser.role) // Отладочная информация
    console.log('Navigation elements:', {
        navCreate: !!navCreate,
        navMy: !!navMy,
        navAll: !!navAll,
        navIns: !!navIns
    })
    
    console.log('User info and logout button setup completed') // Отладочная информация

    // Завжди починаємо з прихованої картки очікуваних інспекцій
    if (insPendingCard) hide(insPendingCard)
    
    // Отладочная информация о всех карточках
    console.log('All cards status:', {
        createCard: !!createCard,
        listCard: !!listCard,
        detailCard: !!detailCard,
        insCard: !!insCard,
        insPendingCard: !!insPendingCard,
        insPlannedCard: !!insPlannedCard,
        insHistoryCard: !!insHistoryCard,
        logsCard: !!logsCard
    })
    
    // Отладочная информация о стилях карточек
    console.log('Cards display styles:', {
        createCard: createCard ? createCard.style.display : 'N/A',
        listCard: listCard ? listCard.style.display : 'N/A',
        detailCard: detailCard ? detailCard.style.display : 'N/A',
        insCard: insCard ? insCard.style.display : 'N/A',
        insPendingCard: insPendingCard ? insPendingCard.style.display : 'N/A',
        insPlannedCard: insPlannedCard ? insPlannedCard.style.display : 'N/A',
        insHistoryCard: insHistoryCard ? insHistoryCard.style.display : 'N/A',
        logsCard: logsCard ? logsCard.style.display : 'N/A'
    })

    // Используем новую функцию для обновления навигации
    updateNavigationForRole(currentUser.role)
    
    // Автоматически кликаем на первую доступную кнопку в зависимости от роли
    if (currentUser.role === 'applicant' && navMy) {
        navMy.click()
    } else if (currentUser.role === 'operator' && navAll) {
        navAll.click()
    } else if (currentUser.role === 'inspector' && navInsPending) {
        navInsPending.click()
    } else if (currentUser.role === 'admin' && navAll) {
        navAll.click()
    }
    

}

// Підтримка синхронізації мітки ролі в заголовку зі станом сервера
async function updateUserInfoDisplay() {
    if (!token || !userInfo) return
    try {
        const me = await call(API.me, { method: 'GET' })
        const oldRole = currentUser ? currentUser.role : null
        currentUser = me.user
        
        // Если роль изменилась, обновляем навигацию
        if (oldRole !== currentUser.role) {
            console.log('Role changed from', oldRole, 'to', currentUser.role, '- updating navigation')
            updateNavigationForRole(currentUser.role)
        }
        
        const roleUA = roleTranslations[currentUser.role] || currentUser.role
        userInfo.textContent = `${roleUA} (${currentUser.role})`
        show(userInfo)
    } catch (e) {
        // Ігноруємо; якщо неавторизований, глобальний call() обробить
    }
}

// Функция для обновления навигации в зависимости от роли
function updateNavigationForRole(role) {
    console.log('Updating navigation for role:', role)
    
    // Скрываем все кнопки по умолчанию
    if (navCreate) hide(navCreate)
    if (navMy) hide(navMy)
    if (navAll) hide(navAll)
    if (navIns) hide(navIns)
    if (navInsPending) hide(navInsPending)
    if (navInsPlanned) hide(navInsPlanned)
    if (navLogs) hide(navLogs)
    if (navInsHistory) hide(navInsHistory)
    if (navUsers) hide(navUsers)
    
    // Показываем кнопки в зависимости от роли
    switch (role) {
        case 'applicant':
            if (navCreate) show(navCreate)
            if (navMy) show(navMy)
            break
            
        case 'operator':
            if (navAll) show(navAll)
            if (navLogs) show(navLogs)
            break
            
        case 'inspector':
            if (navIns) show(navIns)
            if (navInsPending) show(navInsPending)
            if (navInsPlanned) show(navInsPlanned)
            if (navInsHistory) show(navInsHistory)
            break
            
        case 'admin':
            if (navCreate) show(navCreate)
            if (navAll) show(navAll)
            if (navIns) show(navIns)
            if (navInsPending) show(navInsPending)
            if (navLogs) show(navLogs)
            if (navUsers) show(navUsers) // Только админ видит кнопку "Користувачі"
            break
    }
    
    console.log('Navigation updated for role:', role)
}

// Навігація
if (navCreate) {
    navCreate.addEventListener('click', () => {
        clearCreateForm()
        showSection('create-card')
    })
}

if (navMy) {
    navMy.addEventListener('click', async () => {
        await loadApps(false)
        showSection('list-card')
    })
}

if (navAll) {
    navAll.addEventListener('click', async () => {
        await loadApps(true)
        showSection('list-card')
    })
}

if (navIns) {
    navIns.addEventListener('click', async () => {
        await loadInspections()
        showSection('ins-card')
        
        // Обновляем справку для инспектора
        setInspectorHelp()
    })
}

if (navInsPending) {
    navInsPending.addEventListener('click', async () => {
        await loadInspectionsPending()
        showSection('ins-pending-card')
        
        // Обновляем справку для инспектора
        setInspectorHelp()
    })
}

if (navLogs) {
    navLogs.addEventListener('click', async () => {
        await loadLogs()
        showSection('logs-card')
    })
}

// Вкладка історії для інспектора
if (typeof navInsHistory !== 'undefined' && navInsHistory) {
    navInsHistory.addEventListener('click', async () => {
        await loadInspectionsHistory()
        showSection('ins-history-card')
        
        // Обновляем справку для инспектора
        setInspectorHelp()
    })
}

// Вкладка запланованих інспекцій для інспектора
if (navInsPlanned) {
    navInsPlanned.addEventListener('click', async () => {
        await loadPlannedInspections()
        showSection('ins-planned-card')
        
        // Обновляем справку для инспектора
        setInspectorHelp()
    })
}

// Завантаження особистої історії інспектора (всі видимі інспекції)
async function loadInspectionsHistory() {
    try {
        // Проверяем, что элемент существует
        const insHistoryList = document.getElementById('ins-history-list')
        if (!insHistoryList) {
            console.error('insHistoryList element not found!')
            return
        }
        
        // Получаем все инспекции
        const inspectionsRes = await call(API.inspections, { method: 'GET' })
        let inspections = inspectionsRes.inspections || []
        
        // Для инспектора показываем только те, где он был ответственным
        if (currentUser && currentUser.role === 'inspector') {
            inspections = inspections.filter(i => i.responsibleUserId === currentUser.id)
            
            // Скрываем те, которые явно скрыты для этого инспектора
            inspections = inspections.filter(i => !(Array.isArray(i.hiddenFor) && i.hiddenFor.includes(currentUser.id)))
        }
        
        // Получаем информацию о заявках для отображения
        const applicationsRes = await call(API.applications, { method: 'GET' })
        const applications = applicationsRes.applications || []
        const applicationsMap = new Map(applications.map(a => [a.id, a]))
        
        // Получаем отклоненные заявки для отображения в истории
        const deniedApplications = applications.filter(a => a.state === 'inspection_denied')
        
        // Получаем заявки с завершенными инспекциями
        const completedInspections = applications.filter(a => a.state === 'inspection_completed')
        
        // Получаем логи для отслеживания изменений статуса
        const logsRes = await call('/api/logs', { method: 'GET' })
        const logs = logsRes.logs || []
        
        // Фильтруем логи связанные с инспекциями
        const inspectionLogs = logs.filter(log => 
            ['conduct_inspection', 'deny_inspection', 'cancel_inspection', 'plan_inspection', 'complete_inspection'].includes(log.action)
        )
        
        // Создаем карту логов по заявкам
        const logsMap = new Map()
        inspectionLogs.forEach(log => {
            if (!logsMap.has(log.applicationId)) {
                logsMap.set(log.applicationId, [])
            }
            logsMap.get(log.applicationId).push(log)
        })
        
        // Создаем элементы для отклоненных заявок
        const deniedItems = deniedApplications.map(application => {
            const applicationLogs = logsMap.get(application.id) || []
            const statusChanges = applicationLogs
                .filter(log => ['conduct_inspection', 'deny_inspection', 'cancel_inspection', 'plan_inspection', 'complete_inspection'].includes(log.action))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 3)
            
            return {
                type: 'denied',
                application,
                lastChange: statusChanges.length > 0 ? new Date(statusChanges[0].createdAt) : new Date(application.updatedAt),
                html: `
                    <div class="list-item" style="border-left: 4px solid #dc3545;">
                        <div>
                            <b>Заявка ${escapeHtml(application.number)} (ВІДХИЛЕНО)</b>
                            <div class="muted">Продукція: ${escapeHtml(application.productName)}</div>
                            <div class="muted">Статус: <span style="color: #dc3545">Відхилено в інспекції</span></div>
                            ${application.rejectionReason ? `<div class="muted">Причина відхилення: ${escapeHtml(application.rejectionReason)}</div>` : ''}
                            ${statusChanges.length > 0 ? `<div class="muted">Останні зміни: ${statusChanges.map(log => `${log.action} (${new Date(log.createdAt).toLocaleDateString()})`).join(', ')}</div>` : ''}
                        </div>
                        <div>
                            <button class="btn" onclick="openApplication('${application.id}')">Відкрити</button>
                        </div>
                    </div>
                `
            }
        })
        
        // Создаем элементы для завершенных инспекций
        const completedItems = completedInspections.map(application => {
            const applicationLogs = logsMap.get(application.id) || []
            const statusChanges = applicationLogs
                .filter(log => ['conduct_inspection', 'deny_inspection', 'cancel_inspection', 'plan_inspection', 'complete_inspection'].includes(log.action))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 3)
            
            const isRevoked = application.inspectionFinalText && application.inspectionFinalText.includes('відкликано')
            const statusColor = isRevoked ? '#dc3545' : '#28a745'
            const statusText = isRevoked ? 'СЕРТИФІКАТ ВІДКЛИКАНО' : 'СЕРТИФІКАТ ПІДТВЕРДЖЕНО'
            
            return {
                type: 'completed',
                application,
                lastChange: statusChanges.length > 0 ? new Date(statusChanges[0].createdAt) : new Date(application.updatedAt),
                html: `
                    <div class="list-item" style="border-left: 4px solid ${statusColor};">
                        <div>
                            <b>Заявка ${escapeHtml(application.number)} (${statusText})</b>
                            <div class="muted">Продукція: ${escapeHtml(application.productName)}</div>
                            <div class="muted">Статус: <span style="color: ${statusColor}">${statusText}</span></div>
                            ${application.inspectionFinalText ? `<div class="muted">Результат: ${escapeHtml(application.inspectionFinalText)}</div>` : ''}
                            ${statusChanges.length > 0 ? `<div class="muted">Останні зміни: ${statusChanges.map(log => `${log.action} (${new Date(log.createdAt).toLocaleDateString()})`).join(', ')}</div>` : ''}
                        </div>
                        <div>
                            <button class="btn" onclick="openApplication('${application.id}')">Відкрити</button>
                        </div>
                    </div>
                `
            }
        })
        
        // Создаем элементы для запланированных инспекций
        const plannedInspections = inspections.filter(i => i.status === 'заплановано')
        const plannedItems = plannedInspections.map(inspection => {
            const application = applicationsMap.get(inspection.applicationId)
            if (!application) return null
            
            return {
                type: 'planned',
                inspection,
                lastChange: new Date(inspection.createdAt),
                html: `
                    <div class="list-item" style="border-left: 4px solid #ffc107;">
                        <div>
                            <b>Заявка ${escapeHtml(application.number)} (ЗАПЛАНОВАНО)</b>
                            <div class="muted">Продукція: ${escapeHtml(application.productName)}</div>
                            <div class="muted">Дата: ${inspection.date} | Тип: ${escapeHtml(inspection.type)}</div>
                            <div class="muted">Відповідальний: ${escapeHtml(inspection.responsibleName)}</div>
                            ${inspection.notes ? `<div class="muted">Примітки: ${escapeHtml(inspection.notes)}</div>` : ''}
                        </div>
                        <div>
                            <button class="btn" onclick="openApplication('${application.id}')">Відкрити</button>
                            <button class="btn" onclick="completeInspection('${inspection.id}')">Провести</button>
                            <button class="btn" onclick="editPlannedInspection('${inspection.id}')" style="background-color: #17a2b8;">Перенести</button>
                        </div>
                    </div>
                `
            }
        }).filter(Boolean)
        
        if (inspections.length === 0 && deniedApplications.length === 0 && completedInspections.length === 0) {
            if (insHistoryList) {
                insHistoryList.innerHTML = '<div class="muted">Поки не було жодних інспекцій</div>'
            }
            return
        }
        
        // Сортируем по дате (новые сверху)
        inspections.sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
        
        // Объединяем все элементы и сортируем по дате последнего изменения
        const allItems = [...deniedItems, ...completedItems, ...inspections.map(inspection => {
            const application = applicationsMap.get(inspection.applicationId)
            const applicationLogs = logsMap.get(inspection.applicationId) || []
            
            // Получаем последние изменения статуса для этой заявки
            const statusChanges = applicationLogs
                .filter(log => ['conduct_inspection', 'deny_inspection', 'cancel_inspection', 'plan_inspection', 'complete_inspection'].includes(log.action))
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 3) // Показываем последние 3 изменения
            
            if (!application) {
                // Если заявка не найдена, показываем инспекцию с базовой информацией
                return {
                    type: 'inspection',
                    lastChange: new Date(inspection.createdAt || inspection.date),
                    html: `
                        <div class="list-item">
                            <div>
                                <b>Заявка ${escapeHtml(inspection.applicationId)}</b>
                                <div class="muted">Дата: ${inspection.date || 'N/A'} | Статус: <span style="color: #666">${escapeHtml(inspection.status || '')}</span></div>
                                ${inspection.notes ? `<div class="muted">Примітки: ${escapeHtml(inspection.notes)}</div>` : ''}
                                ${statusChanges.length > 0 ? `<div class="muted">Останні зміни: ${statusChanges.map(log => `${log.action} (${new Date(log.createdAt).toLocaleDateString()})`).join(', ')}</div>` : ''}
                            </div>
                            <div>
                                <button class="btn" onclick="openApplication('${inspection.applicationId}')">Відкрити</button>
                                ${currentUser && currentUser.role === 'inspector' ? `<button class="btn remove" data-id="${inspection.id}">Прибрати</button>` : ''}
                            </div>
                        </div>
                    `
                }
            }
            
            // Определяем цвет статуса
            let statusColor = '#666'
            if (inspection.status === 'заплановано') statusColor = '#ffc107'
            else if (inspection.status === 'завершено') statusColor = '#28a745'
            else if (inspection.status === 'відхилено') statusColor = '#dc3545'
            else if (inspection.status === 'скасовано') statusColor = '#6c757d'
            
            return {
                type: 'inspection',
                lastChange: new Date(inspection.createdAt || inspection.date),
                html: `
                    <div class="list-item">
                        <div>
                            <b>Заявка ${escapeHtml(application.number)}</b>
                            <div class="muted">Продукція: ${escapeHtml(application.productName)}</div>
                            <div class="muted">Дата інспекції: ${inspection.date || 'N/A'} | Статус: <span style="color: ${statusColor}">${escapeHtml(inspection.status || '')}</span></div>
                            ${inspection.notes ? `<div class="muted">Примітки: ${escapeHtml(inspection.notes)}</div>` : ''}
                            ${statusChanges.length > 0 ? `<div class="muted">Останні зміни: ${statusChanges.map(log => `${log.action} (${new Date(log.createdAt).toLocaleDateString()})`).join(', ')}</div>` : ''}
                        </div>
                        <div>
                            <button class="btn" onclick="openApplication('${inspection.applicationId}')">Відкрити</button>
                            ${currentUser && currentUser.role === 'inspector' ? `<button class="btn remove" data-id="${inspection.id}">Прибрати</button>` : ''}
                        </div>
                    </div>
                `
            }
        })]
        
        // Сортируем все элементы по дате последнего изменения (новые сверху)
        allItems.sort((a, b) => b.lastChange - a.lastChange)
        
        if (insHistoryList) {
            insHistoryList.innerHTML = allItems.map(item => item.html).join('')
            
            // Добавляем обработчики для кнопок "Прибрати"
            if (currentUser && currentUser.role === 'inspector') {
                insHistoryList.querySelectorAll('.remove').forEach(b => b.addEventListener('click', async () => {
                    try {
                        // Скрываем инспекцию для этого инспектора
                        const inspectionId = b.dataset.id
                        await call(`/api/inspections/${inspectionId}/hide-for/${currentUser.id}`, { method: 'POST', headers: headersJSON() })
                        await loadInspectionsHistory()
                    } catch (e) { 
                        alert(e.message || 'Помилка') 
                    }
                }))
            }
        }
        
    } catch (e) {
        if (insHistoryList) {
            insHistoryList.innerHTML = '<div class="error">Помилка завантаження</div>'
        }
        console.error('Error loading inspections history:', e)
    }
}

// Функція редагування запланованої інспекції через повну форму
async function editPlannedInspection(inspectionId) {
    try {
        const inspectionRes = await call(`/api/inspections/${inspectionId}`, { method: 'GET' })
        const inspection = inspectionRes.inspection
        if (!inspection) {
            alert('Інспекцію не знайдено')
            return
        }
        // Показуємо тільки форму планування/редагування
        showSection('ins-card')
        // Заповнюємо форму значеннями інспекції
        insApp.value = inspection.applicationId
        insDate.value = inspection.date
        document.getElementById('ins-place').value = inspection.place || ''
        insResp.value = inspection.responsibleName || ''
        insNotes.value = inspection.notes || ''
        insType.value = inspection.type || ''
        insOrder.checked = !!inspection.orderSigned
        // Перемикаємо кнопку на режим оновлення
        const createBtn = document.getElementById('ins-create')
        if (createBtn) {
            createBtn.textContent = 'Оновити інспекцію'
            createBtn.onclick = () => updateInspection(inspectionId)
            createBtn.dataset.originalOnclick = 'true'
        }
        // Зберігаємо ID для update
        document.getElementById('ins-card').dataset.editingInspectionId = inspectionId
    } catch (e) {
        alert(e.message || 'Помилка при редагуванні інспекції')
    }
}

// Створення
if (createForm) {
    createForm.addEventListener('submit', async e => {
	e.preventDefault()
	const productName = document.getElementById('productName').value.trim()
	const productType = document.getElementById('productType').value
	const applicantType = document.getElementById('applicantType').value
	const otherApplicantType = document.getElementById('otherApplicantType').value.trim()
	
	if (!productName) return alert('Вкажіть назву продукції')
	
	// Если выбрано "інше", проверяем что заполнено поле
	if (applicantType === 'інше' && !otherApplicantType) {
		return alert('Якщо вибрано "Інше", укажіть хто ви')
	}
	
	// Формируем финальный тип заявника
	const finalApplicantType = applicantType === 'інше' ? otherApplicantType : applicantType
	
	try {
		const json = await call(API.apps, {
			method: 'POST',
			headers: headersJSON(),
			body: JSON.stringify({ 
				productName, 
				productType, 
				applicantType: finalApplicantType 
			}),
		})
		alert('Заявка створена')
		clearCreateForm()
		openApplication(json.application.id)
	} catch (err) {
		alert(err.message || 'Помилка')
	}
    })
}

// Відображення списку для заявника з секцією очікуваних інспекцій
async function loadApps(all = false) {
	try {
		console.log('loadApps called with all:', all) // Отладочная информация
		
		// Очищення змінних сесії при завантаженні нових заявок
		clearSessionVariables()
		
		const scope = all ? 'all' : 'my'
		console.log('Loading applications with scope:', scope, 'role:', currentUser.role)
		
		const res = await call(`${API.apps}?scope=${scope}`, { method: 'GET' })
		let list = res.applications || []
		
		console.log('Received applications:', list.length, list)

		// Сортируем заявки по дате создания (новые сверху)
		list.sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))

		if (appsDiv) {
			appsDiv.innerHTML = ''
		}

		// Для заявника в "Мої": верхній блок з очікуваними інспекціями
		if (!all && currentUser.role === 'applicant') {
			const awaiting = list.filter(a => a.state === 'awaiting_inspection')
			const others = list.filter(a => a.state !== 'awaiting_inspection')
			
			console.log('Applicant view - awaiting:', awaiting.length, 'others:', others.length)

			const top = document.createElement('div')
			top.innerHTML = `<h4>Заявки, що очікують інспекцію</h4>`
			if (!awaiting.length) {
				top.innerHTML += '<div class="muted">Немає заявок</div>'
			} else {
				awaiting.forEach(a => top.appendChild(renderListRow(a)))
			}
			if (appsDiv) appsDiv.appendChild(top)

			const bottom = document.createElement('div')
			bottom.innerHTML = `<h4>Усі мої заявки</h4>`
			if (!others.length) {
				bottom.innerHTML += '<div class="muted">Немає заявок</div>'
			} else {
				others.forEach(a => bottom.appendChild(renderListRow(a)))
			}
			if (appsDiv) appsDiv.appendChild(bottom)
			return
		}

		// Оператор "Всі": спочатку очікувані інспекції, потім решта
		if (all && currentUser.role === 'operator') {
			const awaiting = list.filter(a => a.state === 'awaiting_inspection')
			const others = list.filter(a => a.state !== 'awaiting_inspection')
			
			console.log('Operator view - awaiting:', awaiting.length, 'others:', others.length)

			const top = document.createElement('div')
			top.innerHTML = `<h4>Заявки, що очікують інспекцію</h4>`
			if (!awaiting.length) {
				top.innerHTML += '<div class="muted">Немає заявок</div>'
			} else {
				awaiting.forEach(a => top.appendChild(renderListRow(a)))
			}
			if (appsDiv) appsDiv.appendChild(top)

			const bottom = document.createElement('div')
			bottom.innerHTML = `<h4>Усі заявки</h4>`
			if (!others.length) {
				bottom.innerHTML += '<div class="muted">Немає заявок</div>'
			} else {
				others.forEach(a => bottom.appendChild(renderListRow(a)))
			}
			if (appsDiv) appsDiv.appendChild(bottom)
			return
		}

		// Адмін "Всі" використовує простий список за замовчуванням (без додаткових блоків)
		if (!list.length) {
			if (appsDiv) {
				appsDiv.innerHTML = '<div class="muted">Немає заявок</div>'
			}
			return
		}
		if (appsDiv) {
			list.forEach(a => appsDiv.appendChild(renderListRow(a)))
		}
	} catch (err) {
		console.error('Error loading applications:', err)
		alert(err.message || 'Не вдалося завантажити заявки')
	}
	
	console.log('loadApps completed') // Отладочная информация
}

function renderListRow(a) {
    const div = document.createElement('div')
    div.className = 'list-item'
    const canDelete = (currentUser && currentUser.role === 'applicant' && a.applicantId === currentUser.id) || (currentUser && ['operator', 'admin'].includes(currentUser.role))
    
    // Формируем информацию о заявнике и операторе
    let applicantInfo = `Заявник: ${escapeHtml(a.applicantId)}`
    if (a.applicantType && a.applicantType !== a.applicantId) {
        applicantInfo += ` (${escapeHtml(a.applicantType)})`
    }
    
    let operatorInfo = ''
    if (a.operatorId) {
        operatorInfo = `<div class="muted">Оператор: ${escapeHtml(a.operatorId)}</div>`
    }
    
    div.innerHTML = `
        <div>
            <div class="title">${escapeHtml(a.productName)}</div>
            <div class="muted">ID: ${a.id}</div>
            <div class="muted">${applicantInfo}</div>
            <div class="muted">Тип продукції: ${escapeHtml(a.productType)}</div>
            ${operatorInfo}
            <div class="muted">Статус: ${escapeHtml(stepNamesUA[a.state] || a.state)}</div>
        </div>
        <div>
            <button class="btn view" data-id="${a.id}">Відкрити</button>
            ${canDelete ? `<button class="btn delete" data-id="${a.id}" style="background-color: #dc3545; margin-left: 8px;">Видалити</button>` : ''}
        </div>
    `
    // підключення
    setTimeout(() => {
        div.querySelector('.view').addEventListener('click', () => openApplication(a.id))
        const del = div.querySelector('.delete')
        if (del) del.addEventListener('click', async () => {
            if (!confirm('Ви впевнені, що хочете видалити цю заявку? Це незворотна дія!')) return
            try {
                await call(API.deleteApp(a.id), { method: 'DELETE', headers: headersJSON() })
                alert('Заявку видалено')
                // перезавантаження поточного виду
                if (currentUser && currentUser.role === 'operator') {
                    if (navAll) navAll.click()
                } else {
                    if (navMy) navMy.click()
                }
            } catch (e) { alert(e.message || 'Помилка видалення заявки') }
        })
    })
    return div
}

// Відкриття заявки
async function openApplication(id) {
	try {
		hideInspectionReportCard()
		// НЕ скидаємо сесійні змінні при кожному відкритті заявки
		// Це дозволяє зберегти стан між перемалюваннями інтерфейсу
		logAction('Відкриваємо заявку', id, `sessionUploads[id] = ${sessionUploads[id]}, sessionFileUploadedForFix[id] = ${sessionFileUploadedForFix[id]}`)
		
		// Сбрасываем подписи для новой инспекции
		const inspectorSignBtn = document.getElementById('ins-report-inspector-sign-btn')
		if (inspectorSignBtn) {
			inspectorSignBtn.disabled = false
			inspectorSignBtn.textContent = 'Підписати інспекцію'
			inspectorSignBtn.style.backgroundColor = '#007bff'
		}
		
		const applicantSignBtn = document.getElementById('ins-report-applicant-sign-btn')
		if (applicantSignBtn) {
			applicantSignBtn.disabled = false
			applicantSignBtn.textContent = 'Підписати заявника'
			applicantSignBtn.style.backgroundColor = '#007bff'
		}

		const res = await call(API.app(id))
		const { application, files, tests, certificate, allowedActions } = res
		
		if (appNumber) appNumber.textContent = `Заявка № ${application.id}`
		if (appState) appState.textContent = stepNamesUA[application.state] || application.state

		// Создаем степпер
		if (stepper) {
			stepper.innerHTML = ''
			Object.keys(stepNamesUA).forEach(s => {
				const div = document.createElement('div')
				div.className = 'step' + (s === application.state ? ' current' : '')
				div.textContent = stepNamesUA[s]
				stepper.appendChild(div)
			})
		}

		// Создаем контент
		let html = `<div class="muted">Заявник: ${escapeHtml(application.applicantId)}`
		if (application.applicantType && application.applicantType !== application.applicantId) {
			html += ` (${escapeHtml(application.applicantType)})`
		}
		html += `</div>`
		html += `<div class="muted">Тип продукції: ${escapeHtml(application.productType)}</div>`
		if (application.operatorId) {
			html += `<div class="muted">Оператор: ${escapeHtml(application.operatorId)}</div>`
		}
		
		// Показываем причину отказа если есть
		if (application.rejectionReason) {
			html += `<div class="rejection-reason">
				<strong>Причина відмови:</strong> ${escapeHtml(application.rejectionReason)}
			</div>`
		}
		

		
		// Показываем сообщение об отмене инспекции только если инспекция не проведена успешно
		if (application.meta && application.meta.inspectionCancelledAt && 
			application.state !== 'inspection_completed' && 
			application.state !== 'inspection_denied') {
			const cancelledDate = new Date(application.meta.inspectionCancelledAt)
			const formattedDate = cancelledDate.toLocaleString('uk-UA', {
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			})
			html += `<div class="rejection-reason" style="color: #ffc107;">
				<strong>Інспекцію скасовано:</strong> ${formattedDate}
			</div>`
		}
		
		// Показываем сообщение о переносе инспекции если есть
		if (application.meta && application.meta.inspectionRescheduledTo) {
			html += `<div class="rejection-reason" style="color: #17a2b8;">
				<strong>Інспекцію перенесено на:</strong> ${application.meta.inspectionRescheduledTo}
			</div>`
		}
		
        html += `<h4>Документи</h4>`
        if (files && files.length) {
            // Фильтруем обычные документы (не доказательства инспекции)
            const regularFiles = files.filter(f => f.context !== 'inspection_evidence')
            let evidenceFiles = files.filter(f => f.context === 'inspection_evidence')

            // Если в ответе нет доказательств, но они сохранены в application.inspectionEvidence — показываем их тоже
            if ((!evidenceFiles || evidenceFiles.length === 0) && Array.isArray(application.inspectionEvidence) && application.inspectionEvidence.length > 0) {
                evidenceFiles = application.inspectionEvidence.map(e => {
                    const rawPath = e && e.path ? String(e.path) : ''
                    const base = rawPath ? rawPath.split('\\').pop().split('/').pop() : ''
                    const webPath = rawPath.startsWith('/uploads/') ? rawPath : (base ? `/uploads/${base}` : '')
                    return {
                        originalName: e.originalName || base || 'evidence',
                        path: webPath,
                        size: e.size || 0,
                        context: 'inspection_evidence',
                    }
                })
            }
            
            if (regularFiles.length > 0) {
                regularFiles.forEach(f => {
                    const who = f.uploaderId === application.applicantId ? 'Заявник' : 'Оператор'
                    const context = f.context || 'Загальна документація'
                    html += `<div>
                        <span class="muted">${who}:</span> 
                        <a href="${f.path}" target="_blank">${escapeHtml(f.originalName)}</a>
                        <span class="muted">(${Math.round(f.size / 1024)} KB)</span>
                        <span class="muted">— ${escapeHtml(context)}</span>
                    </div>`
                })
            } else {
                html += `<div class="muted">Немає документів</div>`
            }
            
            // Не дублюємо: не виводимо докази тут, а збережемо їх, щоб показати нижче після блоку випробувань
            window.__evidenceFilesTemp = (evidenceFiles && evidenceFiles.length) ? evidenceFiles : []
        } else {
            html += `<div class="muted">Немає документів</div>`
            // Скидаємо тимчасовий список доказів, щоб не перетягувався між заявками
            window.__evidenceFilesTemp = []
        }

		html += `<h4>Тести</h4>`
		if (tests && tests.length) {
			tests.forEach(t => {
				html += `<div class="muted">
					${escapeHtml(t.name)}: ${t.value} — ${escapeHtml(t.result)}
				</div>`
			})
		} else {
			html += `<div class="muted">Немає тестів</div>`
		}

		// 1) Серійна: показуємо блок збереженої оцінки ПЕРЕД іншими даними
		if (application.productType === 'серійна' && application.meta && application.meta.serialPreEval) {
			const pe = application.meta.serialPreEval
			html += `<h4>Оцінка для серійної продукції</h4>
				<div class="muted">1) Аналіз документації (без аудиту виробництва): ${escapeHtml(pe.docOnlyScore)}</div>
				<div class="muted">2) Проведення аудиту виробництва: ${escapeHtml(pe.productionAuditScore)}</div>
				<div class="muted">3) Проведення атестації виробництва: ${escapeHtml(pe.productionAttScore)}</div>
				<div class="muted">4) Сертифікація (оцінка) системи управління: ${escapeHtml(pe.managementSystemScore)}</div>
				<div class="muted">Обраний строк сертифіката: ${escapeHtml(pe.chosenValidityYears)} ${pe.chosenValidityYears === 1 ? 'рік' : 'роки'}</div>`
		}

		// 2) Дані відбору зразків (після блоку серійної оцінки)
		if (application.samplingData) {
			html += `<h4>Дані відбору зразків та їх ідентифікації</h4>
				<div class="muted">Марка/модель: ${escapeHtml(application.samplingData.code)}</div>
				<div class="muted">Серійний №: ${escapeHtml(application.samplingData.serialNumber)}</div>
				<div class="muted">Кількість: ${escapeHtml(application.samplingData.quantity)}</div>
				<div class="muted">Умови зберігання: ${escapeHtml(application.samplingData.storageConditions)}</div>
				<div class="muted">Код зразка в системі: ${escapeHtml(application.samplingData.sampleCode)}</div>
				<div class="muted">Дата відбору: ${escapeHtml(application.samplingData.samplingDate)}</div>
				<div class="muted">Місце відбору: ${escapeHtml(application.samplingData.samplingPlace)}</div>
				<div class="muted">Відповідальний: ${escapeHtml(application.samplingData.inspectorName)}</div>`
		}

		// 3) Дані сертифікаційних випробувань
		if (application.certificationData) {
			html += `<h4>Дані сертифікаційних випробувань</h4>
				<div class="muted">Номер протоколу: ${escapeHtml(application.certificationData.protocolNumber)}</div>
				<div class="muted">Дата проведення: ${escapeHtml(application.certificationData.conductDate)}</div>
				<div class="muted">Організація: ${escapeHtml(application.certificationData.organization)}</div>
				<div class="muted">Метод випробувань: ${escapeHtml(application.certificationData.testMethod)}</div>
				<div class="muted">Результат: ${escapeHtml(application.certificationData.result)}</div>
				<div class="muted">Оцінка: ${application.certificationData.score}/100</div>`
		}
		
		// 3.1) Фото-/відео-докази інспекції — показуємо тільки коли доречно
		(() => {
			let evList = window.__evidenceFilesTemp || []
			if ((!evList || evList.length === 0) && Array.isArray(application.inspectionEvidence) && application.inspectionEvidence.length > 0) {
				evList = application.inspectionEvidence.map(e => {
					const rawPath = e && e.path ? String(e.path) : ''
					const base = rawPath ? rawPath.split('\\').pop().split('/').pop() : ''
					const webPath = rawPath.startsWith('/uploads/') ? rawPath : (base ? `/uploads/${base}` : '')
					return { originalName: e.originalName || base || 'evidence', path: webPath, size: e.size || 0 }
				})
			}
			const shouldShowEvidenceSection = (evList && evList.length) ||
				(application.state === 'inspection_planned' && currentUser && currentUser.role === 'inspector') ||
				(application.state === 'awaiting_inspection' && currentUser && currentUser.role === 'inspector') ||
				(application.state === 'inspection_completed')
			if (!shouldShowEvidenceSection) return
			html += `<h4>Фото- або відео-докази інспекції</h4>`
			html += `<div class="muted" style="margin: 6px 0 10px 0;">Не більше 300 MB сумарно на всі файли</div>`
			if (evList && evList.length) {
				evList.forEach(f => {
					const sizeMb = Math.round((f.size || 0) / 1024 / 1024 * 100) / 100
					html += `<div>
						<span class=\"muted\">Інспектор:</span>
						<a href=\"${f.path}\" target=\"_blank\">${escapeHtml(f.originalName)}</a>
						${sizeMb ? `<span class=\\\"muted\\\">(${sizeMb} MB)</span>` : ''}
						<span class=\"muted\">— Завантажено під час інспекції</span>
					</div>`
				})
			}
		})()
		
		// 4) Результат інспекції (если есть)
		if (application.state === 'inspection_completed') {
			// Показываем результат инспекции
			if (application.inspectionFinalText) {
				const isRevoked = application.inspectionFinalText.includes('відкликано')
				const resultColor = isRevoked ? '#dc3545' : '#28a745'
				
				html += `<h4>Результат інспекції</h4>
					<div style="color: ${resultColor}; font-weight: bold; margin-bottom: 8px;">
						${escapeHtml(application.inspectionFinalText)}
					</div>`
			}
			
			// Показываем детали инспекции если есть
			if (application.inspectionResult && typeof application.inspectionResult === 'object') {
				const result = application.inspectionResult
				html += `<div class="muted">Документи (сертифікати, протоколи випробувань): ${result.testsOk ? 'В порядку' : 'Не в порядку'}</div>
					<div class="muted">Виробничі процеси: ${result.prodOk ? 'Добре налаштовані' : 'Потребують покращення'}</div>
					<div class="muted">Відповідність продукції вимогам: ${result.qualityOk ? 'Відповідає' : 'Не відповідає'}</div>`
			}
			
			// Показываем комментарии инспектора если есть
			if (application.inspectionComments) {
				html += `<div style="margin-top: 12px;">
					<strong>Коментарі інспектора:</strong>
					<div class="muted" style="margin-top: 4px;">${escapeHtml(application.inspectionComments)}</div>
				</div>`
			}
			
			// Показываем дату и время проведения инспекции
			if (application.inspectionConductedAt) {
				html += `<div style="margin-top: 8px; color: #666;">
					<strong>Інспекцію проведено:</strong> ${new Date(application.inspectionConductedAt).toLocaleString()}
				</div>`
			}
			
			// Показываем статус подписи
			if (application.inspectionSignedByInspector) {
				html += `<div style="margin-top: 12px; color: #28a745;">
					<strong>✅ Підписано інспектором:</strong> ${new Date(application.inspectionSignedByInspector).toLocaleString()}
				</div>`
			}
			
			if (application.inspectionSignedByApplicant) {
				html += `<div style="margin-top: 8px; color: #28a745;">
					<strong>✅ Підписано заявником:</strong> ${new Date(application.inspectionSignedByApplicant).toLocaleString()}
				</div>`
			}
		}
		
		// Показываем форму загрузки доказательств для інспектора під час інспекції (без повторної підказки)
		if (application.state === 'inspection_planned' && currentUser && currentUser.role === 'inspector') {
			html += `<div id="evidence-selected-${application.id}" class="muted" style="margin-top: 12px; margin-bottom: 8px;">Файл не обрано</div>
				<div style="margin-bottom: 12px;">
					<input type="file" id="evidence-file-input-${application.id}" style="display:none" accept="image/*,video/*,application/pdf" multiple />
					<button id="pick-evidence-file-${application.id}" class="btn ghost">Обрати файл</button>
					<button id="upload-evidence-btn-${application.id}" class="btn">Завантажити файл</button>
				</div>`
		}
		
		// Показываем форму загрузки доказательств для інспектора для заявок на інспекцію
		if (application.state === 'awaiting_inspection' && currentUser && currentUser.role === 'inspector') {
			html += `<div id="evidence-selected-${application.id}" class="muted" style="margin-top: 12px; margin-bottom: 8px;">Файл не обрано</div>
				<div style="margin-bottom: 12px;">
					<input type="file" id="evidence-file-input-${application.id}" style="display:none" accept="image/*,video/*,application/pdf" multiple />
					<button id="pick-evidence-file-${application.id}" class="btn ghost">Обрати файл</button>
					<button id="upload-evidence-btn-${application.id}" class="btn">Завантажити файл</button>
				</div>`
		}
		
		// Показываем кнопку подписи для инспектора
		if (application.state === 'inspection_completed' && currentUser && currentUser.role === 'inspector' && !application.inspectionSignedByInspector) {
			html += `<div style="margin-top: 16px;">
				<button id="sign-inspection-btn-${application.id}" class="btn" style="background-color: #007bff;">Підписати інспекцію</button>
			</div>`
		}
		
		// Показываем кнопку подписи для заявника (только после подписи инспектора)
		if (application.state === 'inspection_completed' && 
			currentUser.role === 'applicant' && 
			application.applicantId === currentUser.id &&
			application.inspectionSignedByInspector && 
			!application.inspectionSignedByApplicant) {
			html += `<div style="margin-top: 16px;">
				<button id="sign-inspection-applicant-btn-${application.id}" class="btn" style="background-color: #007bff;">Підписати інспекцію</button>
			</div>`
		}

        if (certificate) {
            html += `<h4>Сертифікат</h4>
                <div class="certificate-block">
                    <div class="centered-number">${escapeHtml(certificate.number)}</div>
                    <div class="muted">Видав: ${escapeHtml(certificate.issuedById)} | ${escapeHtml(certificate.issuedAt)}</div>
                    <div class="muted">Дійсний до: ${escapeHtml(certificate.expiresAt)} (${certificate.validityYears} р.)</div>
                    <a href="${certificate.pdfPath}" class="btn" target="_blank">Завантажити PDF</a>
                </div>`
        }

        // Підказка для стану укладання договору (оператор спочатку, потім заявник)
        if (application.state === 'contract_signed' && ['партія', 'серійна'].includes(application.productType)) {
            const applicantSigned = application.contractSignedAt
            const operatorSigned = application.meta && application.meta.operatorSignedAt
            if (applicantSigned && operatorSigned) {
                html += `<div class=\"muted\" style=\"margin-top:8px\">Договір підписано обома сторонами. Можна реєструвати в реєстрі.</div>`
            } else if (!operatorSigned && !applicantSigned) {
                if (currentUser.role === 'applicant') {
                    html += `<div class=\"muted\" style=\"margin-top:8px\">Очікується підпис оператора.</div>`
                } else {
                    html += `<div class=\"muted\" style=\"margin-top:8px\">Підпишіть договір як оператор, після цього заявник зможе підписати.</div>`
                }
            } else if (operatorSigned && !applicantSigned) {
                html += `<div class=\"muted\" style=\"margin-top:8px\">Очікується підпис заявника.</div>`
            } else if (!operatorSigned && applicantSigned) {
                html += `<div class=\"muted\" style=\"margin-top:8px\">Очікується підпис оператора.</div>`
            }
        }

        // Підказка/статус після генерації сертифіката
        if (application.state === 'certificate_generated') {
            if (application.productType === 'одиничний') {
                if (currentUser.role === 'operator') {
                    html += `<div class="muted" style="margin-top:8px">Одиничний виріб: одразу реєструйте в реєстрі</div>`
                }
            } else {
                if (currentUser.role === 'operator') {
                    html += `<div class="muted" style="margin-top:8px">Партія/серійна: перейдіть до укладання договору</div>`
                }
            }
        }

        // Контролюємо UX виправлень для заявника (з українською кнопкою вибору файлу)
        if (currentUser.role === 'applicant' && application.applicantId === currentUser.id) {
            if (application.state === 'draft') {
                html += `<div style="margin-top:12px">
                    <input type="file" id="file-input-${application.id}" style="display:none" />
                    <button id="pick-file-${application.id}" class="btn ghost">Обрати файл</button>
                    <span id="picked-name-${application.id}" class="muted">Файл не обрано</span>
                    <button id="upload-btn-${application.id}" class="btn">Завантажити файл</button>
                </div>`
            } else if (application.state === 'doc_corrections') {
                const fixStarted = sessionUploads[application.id] || false
                const hasUploadedFile = sessionFileUploadedForFix && sessionFileUploadedForFix[application.id] || false
                if (!fixStarted) {
                    html += `<div style="margin-top:12px">
                        <button id="fix-start-${application.id}" class="btn">Виправити помилки</button>
                    </div>`
                } else {
                    html += `<div style="margin-top:12px">
                        <input type="file" id="file-input-${application.id}" style="display:none" />
                        <button id="pick-file-${application.id}" class="btn ghost">Обрати файл</button>
                        <span id="picked-name-${application.id}" class="muted">Файл не обрано</span>
                        <button id="upload-btn-${application.id}" class="btn">Завантажити файл</button>
                    </div>`
                    if (hasUploadedFile) {
                        html += `<div style="margin-top:8px">
                            <button id="submit-fix-${application.id}" class="btn">Відправити виправлення документів</button>
                        </div>`
                    }
                }
            }
        }

        // Для оператора/адміна — теж українська кнопка вибору файлу
        if ((currentUser.role === 'operator' || currentUser.role === 'admin') &&
            (application.state === 'sampling_and_tests' || application.state === 'test_protocols')) {
            html += `<div style="margin-top:12px">
                <input type="file" id="file-input-${application.id}" style="display:none" />
                <button id="pick-file-${application.id}" class="btn ghost">Обрати файл</button>
                <span id="picked-name-${application.id}" class="muted">Файл не обрано</span>
                <button id="upload-btn-${application.id}" class="btn">Завантажити файл</button>
            </div>`
        }
		
		// Красивое отображение отклонения инспекции в самом низу (если заявка в состоянии inspection_denied)
		if (application.state === 'inspection_denied' && application.meta && application.meta.inspectionDenialReason) {
			html += `
				<div style="margin-top: 20px; padding: 15px; background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px;">
					<div style="color: #856404; font-weight: bold; margin-bottom: 8px;">
						⚠️ Інспекцію відхилено
					</div>
					<div style="color: #856404;">
						<strong>Причина:</strong> ${escapeHtml(application.meta.inspectionDenialReason)}
					</div>
				</div>
			`
		}
		
		if (detailContent) detailContent.innerHTML = html

		// Создаем кнопки действий
		if (actionsDiv) actionsDiv.innerHTML = ''

		// Обработчики для загрузки доказательств инспекции
		if (application.state === 'inspection_planned' && currentUser && currentUser.role === 'inspector') {
			const evidenceFileInput = document.getElementById(`evidence-file-input-${application.id}`)
			const pickEvidenceFileBtn = document.getElementById(`pick-evidence-file-${application.id}`)
			const uploadEvidenceBtn = document.getElementById(`upload-evidence-btn-${application.id}`)
			const evidenceList = document.getElementById(`evidence-list-${application.id}`)
			
			// Предзаполняем существующие докази, чтобы не было пусто
			if (evidenceList) {
				const existing = Array.isArray(application.inspectionEvidence) ? application.inspectionEvidence : []
				if (existing.length > 0) {
					let htmlList = ''
					existing.forEach(file => {
						const sizeMb = Math.round((file.size || 0) / 1024 / 1024 * 100) / 100
						htmlList += `<div class="muted"><a href="${file.path}" target="_blank">${escapeHtml(file.originalName)}</a>${sizeMb ? ` (${sizeMb} MB)` : ''}</div>`
					})
					evidenceList.innerHTML = htmlList
				} else {
					evidenceList.innerHTML = '<div class="muted">Немає завантажених файлів</div>'
				}
			}
			
			if (pickEvidenceFileBtn) {
				pickEvidenceFileBtn.addEventListener('click', () => {
					evidenceFileInput.click()
				})
			}
			
			if (evidenceFileInput) {
				evidenceFileInput.addEventListener('change', () => {
					const files = evidenceFileInput.files
					if (files.length > 0) {
						let totalSize = 0
						for (let file of files) {
							totalSize += file.size
						}
						
						if (totalSize > 300 * 1024 * 1024) { // 300 MB
							showNotification('Загальний розмір файлів не може перевищувати 300 MB', 'error')
							evidenceFileInput.value = ''
							const sel = document.getElementById(`evidence-selected-${application.id}`)
							if (sel) sel.textContent = 'Файл не обрано'
							return
						}
						
						// Показываем выбранные файлы над кнопками (история снизу не трогаем)
						let selectedInfo = ''
						for (let file of files) {
							const sizeMb = Math.round(file.size / 1024 / 1024 * 100) / 100
							selectedInfo += `${escapeHtml(file.name)} (${sizeMb} MB); `
						}
						const sel = document.getElementById(`evidence-selected-${application.id}`)
						if (sel) sel.textContent = selectedInfo || 'Файл не обрано'
						// Не перезаписываем evidenceList здесь, чтобы история оставалась видимой
					}
				})
			}
			
			if (uploadEvidenceBtn) {
				uploadEvidenceBtn.addEventListener('click', async () => {
					            const files = evidenceFileInput.files
            if (files.length === 0) {
                showNotification('Оберіть файли для завантаження', 'warning')
                return
            }
					
					let totalSize = 0
					for (let file of files) {
						totalSize += file.size
					}
					
					if (totalSize > 300 * 1024 * 1024) {
						alert('Загальний розмір файлів не може перевищувати 300 MB')
						return
					}
					
					try {
						const formData = new FormData()
						for (let file of files) {
							formData.append('files', file)
						}
						
						const response = await fetch(`/api/applications/${application.id}/upload-evidence`, {
							method: 'POST',
							body: formData,
							headers: { Authorization: `Bearer ${token}` }
						})
						
						if (!response.ok) {
							const errorData = await response.json()
							throw new Error(errorData.error || 'Помилка завантаження')
						}
						
						showNotification('Файли завантажено успішно!', 'success')
						evidenceFileInput.value = ''
						const sel = document.getElementById(`evidence-selected-${application.id}`)
						if (sel) sel.textContent = 'Файл не обрано'
						
						// Локально оновимо список без очікування перерисування
						try {
							const j = await response.json()
							const uploaded = Array.isArray(j.files) ? j.files : []
							if (uploaded.length > 0) {
								let htmlList = ''
								uploaded.forEach(file => {
									const sizeMb = Math.round((file.size || 0) / 1024 / 1024 * 100) / 100
									htmlList += `<div class=\"muted\"><a href=\"${file.path}\" target=\"_blank\">${escapeHtml(file.originalName)}</a>${sizeMb ? ` (${sizeMb} MB)` : ''}</div>`
								})
								evidenceList.innerHTML = htmlList
							}
						} catch {}
						
						// А потім перезавантажимо картку, щоб підтягнути повний стан
						openApplication(application.id)
						
					} catch (e) {
						showNotification('Помилка при завантаженні файлів: ' + e.message, 'error')
					}
				})
			}
		}
		
		// Обработчики для загрузки доказательств инспекции для заявок на інспекцію
		if (application.state === 'awaiting_inspection' && currentUser && currentUser.role === 'inspector') {
			const evidenceFileInput = document.getElementById(`evidence-file-input-${application.id}`)
			const pickEvidenceFileBtn = document.getElementById(`pick-evidence-file-${application.id}`)
			const uploadEvidenceBtn = document.getElementById(`upload-evidence-btn-${application.id}`)
			
			if (pickEvidenceFileBtn) {
				pickEvidenceFileBtn.addEventListener('click', () => {
					evidenceFileInput.click()
				})
			}
			
			if (evidenceFileInput) {
				evidenceFileInput.addEventListener('change', () => {
					const files = evidenceFileInput.files
					if (files.length > 0) {
						let totalSize = 0
						for (let file of files) {
							totalSize += file.size
						}
						
						if (totalSize > 300 * 1024 * 1024) { // 300 MB
							showNotification('Загальний розмір файлів не може перевищувати 300 MB', 'error')
							evidenceFileInput.value = ''
							const sel = document.getElementById(`evidence-selected-${application.id}`)
							if (sel) sel.textContent = 'Файл не обрано'
							return
						}
						
						// Показываем выбранные файлы
						let selectedInfo = ''
						for (let file of files) {
							const sizeMb = Math.round(file.size / 1024 / 1024 * 100) / 100
							selectedInfo += `${escapeHtml(file.name)} (${sizeMb} MB); `
						}
						const sel = document.getElementById(`evidence-selected-${application.id}`)
						if (sel) sel.textContent = selectedInfo || 'Файл не обрано'
					}
				})
			}
			
			if (uploadEvidenceBtn) {
				uploadEvidenceBtn.addEventListener('click', async () => {
					const files = evidenceFileInput.files
					if (files.length === 0) {
						showNotification('Оберіть файли для завантаження', 'warning')
						return
					}
					
					try {
						const formData = new FormData()
						for (let file of files) {
							formData.append('files', file)
						}
						
						// Отладочная информация
						console.log('Uploading evidence for application:', application.id, 'State:', application.state, 'User role:', currentUser.role)
						
						// Загружаем доказательства
						await call(`/api/applications/${application.id}/upload-evidence`, {
							method: 'POST',
							body: formData
						})
						
						showNotification('Файли успішно завантажено!', 'success')
						
						// Очищаем input и статус
						evidenceFileInput.value = ''
						const status = document.getElementById(`evidence-selected-${application.id}`)
						if (status) status.textContent = 'Файл не обрано'
						
						// Перезагружаем заявку для отображения новых файлов
						openApplication(application.id)
						
					} catch (err) {
						showNotification('Помилка при завантаженні файлів: ' + err.message, 'error')
					}
				})
			}
		}

        // Показываем доступные действия
        if (allowedActions && allowedActions.length > 0) {
            logAction('Доступні дії для заявки', application.id, allowedActions.join(', '))
            
            // Проверяем формат allowedActions
            let actionsToShow = allowedActions.map(action => {
                // Если action - это объект с полями action и label
                if (typeof action === 'object' && action.action && action.label) {
                    return {
                        key: action.action,
                        text: action.label
                    }
                }
                // Если action - это строка
                else if (typeof action === 'string') {
                    return {
                        key: action,
                        text: actionNamesUA[action] || action
                    }
                }
                return null
            }).filter(Boolean)
            // Дополнительный клиентский фильтр: после отмены инспекции скрываем кнопки у инспектора
            if (application.state === 'awaiting_inspection' && application.productType === 'серійна') {
                const wasCancelled = application.meta && application.meta.inspectionCancelledAt
                const reinspectionRequested = application.meta && application.meta.reinspectionRequestedAt
                if (wasCancelled && !reinspectionRequested && currentUser && currentUser.role === 'inspector') {
                    actionsToShow = actionsToShow.filter(a => !['conduct_inspection_now', 'plan_inspection'].includes(a.key))
                }
            }
            // Ховаємо кнопку "Скасувати інспекцію" при відкритті інспекції (щоб лишалась лише "Завершити інспекцію")
            if (application.state === 'inspection_planned' && currentUser && currentUser.role === 'inspector') {
                actionsToShow = actionsToShow.filter(a => a.key !== 'cancel_inspection')
            }
            
            if (actionsToShow.length > 0) {
                // Специальная обработка для serial_pre_evaluation
                const serialPreEvalAction = actionsToShow.find(action => action.key === 'serial_pre_evaluation')
                if (serialPreEvalAction) {
                    // Показываем форму вместо кнопки
                    actionsDiv.innerHTML = `
                        <h4>Оцінка для серійної продукції</h4>
                        <div class="muted">Вкажіть бали 0..100 для кожного пункту</div>
                        <div style="margin: 15px 0;">
                            <div style="margin-bottom: 10px;">
                                <label>1) Аналіз документації (без аудиту виробництва):</label>
                                <input type="number" id="docOnlyScore-${application.id}" min="0" max="100" value="100" style="width: 80px; margin-left: 10px;">
                            </div>
                            <div style="margin-bottom: 10px;">
                                <label>2) Проведення аудиту виробництва:</label>
                                <input type="number" id="productionAuditScore-${application.id}" min="0" max="100" value="100" style="width: 80px; margin-left: 10px;">
                            </div>
                            <div style="margin-bottom: 10px;">
                                <label>3) Проведення атестації виробництва:</label>
                                <input type="number" id="productionAttScore-${application.id}" min="0" max="100" value="100" style="width: 80px; margin-left: 10px;">
                            </div>
                            <div style="margin-bottom: 10px;">
                                <label>4) Сертифікація (оцінка) системи управління:</label>
                                <input type="number" id="managementSystemScore-${application.id}" min="0" max="100" value="100" style="width: 80px; margin-left: 10px;">
                            </div>
                            <div style="margin-bottom: 15px;">
                                <label>Заявка відповідає сертифікату на:</label>
                                <select id="chosenValidityYears-${application.id}" style="margin-left: 10px;">
                                    <option value="0">Не відповідає</option>
                                    <option value="1">1 рік</option>
                                    <option value="2">2 роки</option>
                                    <option value="3">3 роки</option>
                                    <option value="5">5 років</option>
                                </select>
                            </div>
                            <button class="btn" onclick="submitSerialPreEval('${application.id}')">Підтвердити</button>
                        </div>
                    `
                } else {
                    actionsDiv.innerHTML = actionsToShow.map(action => {
                        if (action.key === 'serial_pre_evaluation_edit') {
                            return `<button class="btn" onclick="showSerialPreEvalForm('${application.id}')">${action.text}</button>`
                        }
                        return `<button class="btn" onclick="handleAction('${application.id}', '${action.key}')">${action.text}</button>`
                    }).join('')
                }
            } else {
                actionsDiv.innerHTML = '<div class="muted">Немає доступних дій</div>'
            }
        } else {
            actionsDiv.innerHTML = '<div class="muted">Немає доступних дій</div>'
        }

        // Обработчики для кнопок подписи инспекции
        if (application.state === 'inspection_completed') {
            // Кнопка подписи инспектора
            const signInspectionBtn = document.getElementById(`sign-inspection-btn-${application.id}`)
            if (signInspectionBtn) {
                signInspectionBtn.addEventListener('click', async () => {
                    try {
                        await call(`/api/applications/${application.id}/sign-inspection`, {
                            method: 'POST',
                            headers: headersJSON(),
                            body: JSON.stringify({ signedBy: 'inspector' })
                        })
                        
                        alert('Інспекцію підписано!')
                        openApplication(application.id)
                        
                    } catch (e) {
                        alert('Помилка при підписанні: ' + e.message)
                    }
                })
            }
            
            // Кнопка подписи заявника
            const signInspectionApplicantBtn = document.getElementById(`sign-inspection-applicant-btn-${application.id}`)
            if (signInspectionApplicantBtn) {
                signInspectionApplicantBtn.addEventListener('click', async () => {
                    try {
                        await call(`/api/applications/${application.id}/sign-inspection`, {
                            method: 'POST',
                            headers: headersJSON(),
                            body: JSON.stringify({ signedBy: 'applicant' })
                        })
                        
                        alert('Інспекцію підписано!')
                        openApplication(application.id)
                        
                    } catch (e) {
                        alert('Помилка при підписанні: ' + e.message)
                    }
                })
            }
        }

        // Поведінка для кнопки старту виправлень
        const fixStart = $(`fix-start-${application.id}`)
        if (fixStart) {
            fixStart.addEventListener('click', () => {
                logAction('Кнопка "Виправити помилки" натиснута', application.id)
                // ЕТАП 1 -> ЕТАП 2: Кнопка "Виправити помилки" зникає, з'являються файл-пікер та завантаження
                sessionUploads[application.id] = true
                // Важливо: скидаємо флаг завантаження файлу при старті виправлень
                if (sessionFileUploadedForFix[application.id]) {
                    delete sessionFileUploadedForFix[application.id]
                }
                logAction('sessionUploads оновлено', application.id, `sessionUploads[application.id] = ${sessionUploads[application.id]}`)
                // Перемалюємо інтерфейс щоб показати файл-пікер та кнопку завантаження
                openApplication(application.id)
            })
        }

        		// Обработчик загрузки файлов
        const upBtn = $(`upload-btn-${application.id}`)
		if (upBtn) {
			upBtn.addEventListener('click', async () => {
				logAction('Кнопка "Завантажити файл" натиснута', application.id)
				const fi = $(`file-input-${application.id}`)
				if (!fi || !fi.files || fi.files.length === 0)
					return alert('Оберіть файл')
				const f = fi.files[0]
				const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/webp']
				if (!allowed.includes(f.type))
					return alert('Недопустимий формат. Дозволено: pdf, jpg, jpeg, webp')
				if (f.size > 5 * 1024 * 1024) return alert('Файл більше 5MB')
				
				const form = new FormData()
				form.append('file', f)
				const r = await fetch(API.upload(application.id), {
					method: 'POST',
					body: form,
					headers: { Authorization: `Bearer ${token}` },
				})
				const j = await r.json()
				if (!r.ok) return alert(j.error || 'Помилка завантаження')
                alert('Файл завантажено')
                
                // ЕТАП 2 -> ЕТАП 3: Після успішного завантаження показуємо кнопку "Відправити виправлення документів"
                sessionFileUploadedForFix[application.id] = true
                logAction('sessionFileUploadedForFix оновлено', application.id, `sessionFileUploadedForFix[application.id] = ${sessionFileUploadedForFix[application.id]}`)
                // Перемалюємо інтерфейс щоб показати синю кнопку
                openApplication(application.id)
			})
		}

        // Кнопка "Обрати файл" — відкрити нативний інпут та показувати назву
        const pickBtn = $(`pick-file-${application.id}`)
        if (pickBtn) {
            const fi = $(`file-input-${application.id}`)
            const nameSpan = $(`picked-name-${application.id}`)
            pickBtn.addEventListener('click', () => fi && fi.click())
            if (fi) fi.addEventListener('change', () => {
                if (fi.files && fi.files[0]) nameSpan.textContent = fi.files[0].name
                else nameSpan.textContent = 'Файл не обрано'
            })
        }

        // Обработчик для кнопки "Відправити виправлення документів" в интерфейсе
        const submitFixBtn = $(`submit-fix-${application.id}`)
        if (submitFixBtn) {
            submitFixBtn.addEventListener('click', async () => {
                logAction('Кнопка "Відправити виправлення документів" натиснута', application.id)
                // Викликаємо API для відправки виправлень
                try {
                    await call(API.submitFixes(application.id), {
                        method: 'POST',
                        headers: headersJSON(),
                        body: JSON.stringify({}),
                    })
                    // Очищаємо сесійні змінні та переходимо до наступного стану
                    delete sessionUploads[application.id]
                    delete sessionFileUploadedForFix[application.id]
                    alert('Виправлення документів успішно відправлено!')
                    await openApplication(application.id) // Перемалюємо інтерфейс
                } catch (err) {
                    alert(err.message || 'Помилка відправки виправлень')
                }
            })
        }


		// При відкритті заявки ховаємо сторонні картки (щоб не з'являвся блок "Заявки на інспекцію")
		if (insPendingCard) hide(insPendingCard)
		if (insPlannedCard) hide(insPlannedCard)
		if (insHistoryCard) hide(insHistoryCard)

		if (detailCard) show(detailCard)
		if (listCard) hide(listCard)
		if (createCard) hide(createCard)
		hide(insCard)
		hide(logsCard)

        // Авто-очистка: якщо заявка вже не потребує інспекції — прибрати її зі "Запланованих інспекцій"
        try {
            await call(`/api/applications/${application.id}/cleanup-planned-inspections`, {
                method: 'POST',
                headers: headersJSON(),
                body: JSON.stringify({})
            })
            try { await loadPlannedInspections() } catch {}
        } catch {}
	} catch (err) {
		alert(err.message || 'Не вдалося відкрити заявку')
	}
}

// переклад дій
function translateAction(action, defaultLabel) {
	const map = {
		submit_docs: 'Надіслати документацію',
		// submit_fix_docs видалено - обробляється вручну в UI
		submit_fix_nonconformities: 'Відправити усунення невідповідностей',
		view_docs: 'Переглянути документацію',
		analyze_docs: 'Оцінити документацію',
		decision_certification_tests: 'Випробування з метою сертифікації',
		decision_sampling: 'Відбирання зразків та ідентифікація',
	
		run_certification_tests: 'Провести випробування',
		input_certification_data: 'Ввести дані сертифікаційних випробувань',
		add_documentation: 'Додати документацію',
		issue_protocols: 'Видати протоколи випробувань',
		analyze_results: 'Аналізувати результати',
		generate_certificate: 'Згенерувати сертифікат',
        sign_contract: 'Підписати договір',
        operator_sign_contract: 'Підписати договір (оператор)',
		continue_process: 'Перейти до укладання договору',
		register: 'Зареєструвати в реєстрі',
		plan_inspection: 'Запланувати інспекцію',
		complete_inspection: 'Завершити інспекцію',
		cancel_inspection: 'Скасувати інспекцію',
		admin_force: 'Примусово змінити стан',
	}
	return map[action] || defaultLabel || action
}

// Функция для показа формы редактирования оценки серійної продукції
async function showSerialPreEvalForm(applicationId) {
    try {
        // Загружаем актуальные данные приложения
        const res = await call(API.app(applicationId))
        const { application } = res
        
        const existingEval = application.meta && application.meta.serialPreEval
        
        // Создаем форму с текущими значениями
        const actionsDiv = $('actions')
        if (!actionsDiv) {
            alert('Помилка: елемент для відображення дій не знайдено')
            return
        }
        actionsDiv.innerHTML = `
            <h4>Оцінка для серійної продукції</h4>
            <div class="muted">Вкажіть бали 0..100 для кожного пункту</div>
            <div style="margin: 15px 0;">
                <div style="margin-bottom: 10px;">
                    <label>1) Аналіз документації (без аудиту виробництва):</label>
                    <input type="number" id="docOnlyScore-${applicationId}" min="0" max="100" value="${existingEval ? existingEval.docOnlyScore : 100}" style="width: 80px; margin-left: 10px;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label>2) Проведення аудиту виробництва:</label>
                    <input type="number" id="productionAuditScore-${applicationId}" min="0" max="100" value="${existingEval ? existingEval.productionAuditScore : 100}" style="width: 80px; margin-left: 10px;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label>3) Проведення атестації виробництва:</label>
                    <input type="number" id="productionAttScore-${applicationId}" min="0" max="100" value="${existingEval ? existingEval.productionAttScore : 100}" style="width: 80px; margin-left: 10px;">
                </div>
                <div style="margin-bottom: 10px;">
                    <label>4) Сертифікація (оцінка) системи управління:</label>
                    <input type="number" id="managementSystemScore-${applicationId}" min="0" max="100" value="${existingEval ? existingEval.managementSystemScore : 100}" style="width: 80px; margin-left: 10px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label>Заявка відповідає сертифікату на:</label>
                    <select id="chosenValidityYears-${applicationId}" style="margin-left: 10px;">
                        <option value="0" ${existingEval && existingEval.chosenValidityYears === 0 ? 'selected' : ''}>Не відповідає</option>
                        <option value="1" ${existingEval && existingEval.chosenValidityYears === 1 ? 'selected' : ''}>1 рік</option>
                        <option value="2" ${existingEval && existingEval.chosenValidityYears === 2 ? 'selected' : ''}>2 роки</option>
                        <option value="3" ${existingEval && existingEval.chosenValidityYears === 3 ? 'selected' : ''}>3 роки</option>
                        <option value="5" ${existingEval && existingEval.chosenValidityYears === 5 ? 'selected' : ''}>5 років</option>
                    </select>
                </div>
                <button class="btn" onclick="submitSerialPreEval('${applicationId}')">Підтвердити</button>
                <button class="btn btn-secondary" onclick="openApplication('${applicationId}')" style="margin-left: 10px;">Скасувати</button>
            </div>
        `
    } catch (error) {
        alert('Помилка при завантаженні даних: ' + error.message)
    }
}

// Функция для отправки оценки серійної продукції
async function submitSerialPreEval(applicationId) {
    const docOnlyScore = parseInt(document.getElementById(`docOnlyScore-${applicationId}`).value)
    const productionAuditScore = parseInt(document.getElementById(`productionAuditScore-${applicationId}`).value)
    const productionAttScore = parseInt(document.getElementById(`productionAttScore-${applicationId}`).value)
    const managementSystemScore = parseInt(document.getElementById(`managementSystemScore-${applicationId}`).value)
    const chosenValidityYears = parseInt(document.getElementById(`chosenValidityYears-${applicationId}`).value)
    
    // Валидация
    if ([docOnlyScore, productionAuditScore, productionAttScore, managementSystemScore].some(score => isNaN(score) || score < 0 || score > 100)) {
        alert('Всі оцінки повинні бути числами від 0 до 100')
        return
    }
    
    try {
        await call(`/api/applications/${applicationId}/serial-pre-eval`, {
            method: 'POST',
            headers: headersJSON(),
            body: JSON.stringify({
                docOnlyScore,
                productionAuditScore,
                productionAttScore,
                managementSystemScore,
                chosenValidityYears
            }),
        })
        
        if (chosenValidityYears > 0) {
            alert(`Попередня оцінка успішна! Сертифікат буде дійсним ${chosenValidityYears} ${chosenValidityYears === 1 ? 'рік' : 'роки'}.`)
        } else {
            alert('Попередня оцінка негативна. Потрібно виправити недоліки та провести оцінку заново.')
        }
        
        // Обновляем отображение заявки
        openApplication(applicationId)
        
    } catch (e) {
        alert('Помилка при збереженні оцінки: ' + e.message)
    }
}

// обробка дії
async function handleAction(applicationId, action) {
	try {
		if (action === 'submit_docs') {
			await call(API.submitDocs(applicationId), {
				method: 'POST',
				headers: headersJSON(),
			})
		// submit_fix_docs видалено - обробляється вручну в UI
		} else if (action === 'submit_fix_nonconformities') {
			await call(API.submitFixes(applicationId), {
				method: 'POST',
				headers: headersJSON(),
				body: JSON.stringify({}),
			})
        } else if (action === 'view_docs') {
            // Діалог вибору одного файлу для відкриття
			const appRes = await call(API.app(applicationId))
			const files = appRes.files || []
			if (files.length === 0) return alert('Немає прикладених файлів')

            // Нумерований список
            const list = files.map((f, i) => `${i + 1}. ${f.originalName}`).join('\n')
            const choice = prompt(`Який документ відкрити?\n${list}\n\nВведіть номер документа:`, '1')
            if (choice === null) return
            const num = parseInt(choice, 10)
            if (isNaN(num) || num < 1 || num > files.length) return alert('Невірний номер')
            const file = files[num - 1]
            window.open(file.path, '_blank')
		} else if (action === 'analyze_docs') {
			const scoreInput = prompt('Оцінка документації (0-100):', '100')
			if (scoreInput === null) return // Отмена - ничего не делаем
			
			const score = Number(scoreInput)
			if (isNaN(score) || score < 0 || score > 100) return alert('Невірне число (0-100)')
			
			let rejectionReason = ''
			if (score < 70) {
				const reasonInput = prompt('Причина відмови (що потрібно виправити):', '')
				if (reasonInput === null) return // Отмена - ничего не делаем
				rejectionReason = reasonInput
			}
			
			await call(API.analyzeDocs(applicationId), {
				method: 'POST',
				headers: headersJSON(),
				body: JSON.stringify({ score, rejectionReason }),
			})
		} else if (action === 'decision_certification_tests') {
			await call(API.preDecision(applicationId), {
				method: 'POST',
				headers: headersJSON(),
				body: JSON.stringify({ decision: 'certification_tests' }),
			})

		} else if (action === 'decision_sampling') {
			// Получаем данные заявки для проверки
			const appRes = await call(API.app(applicationId))
			const application = appRes.application
			
			// Проверяем оценку серійної продукции
			if (application && application.productType === 'серійна' && application.meta && application.meta.serialPreEval) {
				const evaluation = application.meta.serialPreEval
				if (evaluation.chosenValidityYears === 0) {
					alert('Оцінка серійної продукції негативна. Дочекайтеся виправленої партії серійної продукції та оцініть її заново.')
					return
				}
			}
			
			await call(API.preDecision(applicationId), {
				method: 'POST',
				headers: headersJSON(),
				body: JSON.stringify({ decision: 'sampling' }),
			})
		} else if (action === 'run_certification_tests') {
			if (!confirm('Провести випробування з метою сертифікації?')) return
			
			// Переводим заявку в состояние test_protocols
			await call(API.runCertificationTests(applicationId), {
				method: 'POST',
				headers: headersJSON(),
			})
			
			// Показываем сообщение о том, что теперь доступен ввод данных
			alert('Випробування проведено. Тепер доступно введення даних сертифікаційних випробувань.')
			
			// Обновляем вид заявки чтобы показать новые действия
			openApplication(applicationId)
		} else if (action === 'issue_protocols') {
			if (!confirm('Видати протоколи випробувань?')) return
			await call(API.issueProtocols(applicationId), {
				method: 'POST',
				headers: headersJSON(),
			})
        } else if (action === 'analyze_results') {
            let rejectionReason = ''
            const confirmAnalysis = confirm('Аналізувати результати сертифікаційних робіт?')
            if (!confirmAnalysis) return

            const resp = await call(API.analyzeResults(applicationId), {
                method: 'POST',
                headers: headersJSON(),
                body: JSON.stringify({ rejectionReason })
            })
            if (resp && resp.verdict === 'approved') {
                alert('Схвалено!')
            } else if (resp && resp.verdict === 'rejected') {
                alert('Не схвалено. Повернено на етап випробувань для виправлень.')
            }
		} else if (action === 'generate_certificate') {
			// Получаем информацию о заявке для определения рекомендуемого срока
			const appRes = await call(API.app(applicationId))
			const testKeys = appRes.tests.map(t => t.key)
			const recommendedYears = getRecommendedValidity(appRes.application.productType, testKeys)
			
			// Просто используем рекомендуемый срок
			await call(API.generateCert(applicationId), {
				method: 'POST',
				headers: headersJSON(),
				body: JSON.stringify({ validityYears: recommendedYears }),
			})
		} else if (action === 'sign_contract') {
			if (!confirm('Підписати сертифікаційний договір?')) return
			await call(API.signContract(applicationId), {
				method: 'POST',
				headers: headersJSON(),
			})
			alert('Договір підписано заявником')
			openApplication(applicationId) // Оновлюємо інтерфейс
		} else if (action === 'continue_process') {
			if (!confirm('Перейти до укладання сертифікаційного договору?')) return
			await call(API.continueProcess(applicationId), {
				method: 'POST',
				headers: headersJSON(),
			})
			alert('Перейдено до укладання договору')
			openApplication(applicationId) // Оновлюємо інтерфейс
        } else if (action === 'register') {
			if (!confirm('Зареєструвати заявку в реєстрі УкрСЕПРО?')) return
			await call(API.register(applicationId), {
				method: 'POST',
				headers: headersJSON(),
			})
        } else if (action === 'operator_sign_contract') {
            if (!confirm('Підтвердити підписання договору як оператор?')) return
            await call(`/api/applications/${applicationId}/sign-contract-operator`, {
                method: 'POST',
                headers: headersJSON(),
            })
            alert('Договір підписано оператором')
            openApplication(applicationId) // Оновлюємо інтерфейс
        		} else if (action === 'reschedule_inspection') {
			rescheduleInspection(applicationId)
		} else if (action === 'plan_inspection') {
            const date = prompt('Дата інспекції (YYYY-MM-DD):', '')
            if (date === null) return // Отмена
            if (!date) return alert('Дата потрібна')
            
            const resp = prompt('Відповідальний userId:', currentUser.id)
            if (resp === null) return // Отмена
            
            const notes = prompt('Примітки:', '')
            if (notes === null) return // Отмена
            
            // Сначала планируем инспекцию
            const inspectionRes = await call(API.planInsp(applicationId), {
                method: 'POST',
                headers: headersJSON(),
                body: JSON.stringify({ date, responsibleUserId: resp, notes }),
            })
            
            // Спрашиваем, провести ли инспекцию сразу
            if (confirm('Інспекцію заплановано. Провести її зараз?')) {
                const inspectionId = inspectionRes.inspection.id
                // Чекліст: Документи, Процеси, Відповідність продукції
                const docsOk = prompt('Документи (сертифікати, протоколи випробувань) відповідають нормі? (1 — так, 2 — ні):', '1')
                if (docsOk === null) return
                const processesOk = prompt('Виробничі процеси відповідають нормі? (1 — так, 2 — ні):', '1')
                if (processesOk === null) return
                const complianceOk = prompt('Відповідність продукції вимогам? (1 — так, 2 — ні):', '1')
                if (complianceOk === null) return

                await call(API.completeInsp(inspectionId), {
					method: 'POST',
					headers: headersJSON(),
					body: JSON.stringify({ 
                        result: 'відповідає',
                        notes: 'Інспекція проведена одразу після планування.',
                        // Мапа: процеси -> prodOk, відповідність -> qualityOk, документи -> testsOk
                        prodOk: Number(processesOk) === 1 ? 1 : 2,
                        qualityOk: Number(complianceOk) === 1 ? 1 : 2,
                        testsOk: Number(docsOk) === 1 ? 1 : 2,
					}),
				})
				alert('Інспекцію завершено')
			} else {
				alert('Інспекцію заплановано')
			}
		} else if (action === 'complete_inspection') {
            // Находим инспекцию для этой заявки
            const inspectionsRes = await call(API.inspections, { method: 'GET' })
            const inspection = inspectionsRes.inspections.find(i => i.applicationId === applicationId)
            
            if (!inspection) {
                alert('Інспекцію не знайдено')
                return
            }
            
            const docsOk2 = prompt('Документи (сертифікати, протоколи випробувань) відповідають нормі? (1 — так, 2 — ні):', '1')
            if (docsOk2 === null) return
            const processesOk2 = prompt('Виробничі процеси відповідають нормі? (1 — так, 2 — ні):', '1')
            if (processesOk2 === null) return
            const complianceOk2 = prompt('Відповідність продукції вимогам? (1 — так, 2 — ні):', '1')
            if (complianceOk2 === null) return

            await call(API.completeInsp(inspection.id), {
				method: 'POST',
				headers: headersJSON(),
                body: JSON.stringify({
                    result: 'відповідає',
                    prodOk: Number(processesOk2) === 1 ? 1 : 2,
                    qualityOk: Number(complianceOk2) === 1 ? 1 : 2,
                    testsOk: Number(docsOk2) === 1 ? 1 : 2,
                }),
			})
            alert('Інспекцію завершено')
            openApplication(applicationId) // Обновляем вид заявки
            try { await loadPlannedInspections() } catch {}
		} else if (action === 'cancel_inspection') {
			if (!confirm('Ви впевнені, що хочете скасувати інспекцію? Заявка повернеться до стану "Очікування інспекції".')) return
			
			// Находим инспекцию для этой заявки
			const inspectionsRes = await call(API.inspections, { method: 'GET' })
			const inspection = inspectionsRes.inspections.find(i => i.applicationId === applicationId)
			
			if (!inspection) {
				alert('Інспекцію не знайдено')
				return
			}
			
			await call(API.cancelInsp(inspection.id), {
				method: 'POST',
				headers: headersJSON(),
			})
			alert('Інспекцію скасовано')
			openApplication(applicationId) // Обновляем вид заявки
            try { await loadPlannedInspections() } catch {}
		} else if (action === 'continue_to_tests') {
			if (!confirm('Перейти до сертифікаційних випробувань?')) return
			
			// Переводим заявку в состояние certification_tests
			await call(`/api/applications/${applicationId}/continue-to-tests`, {
				method: 'POST',
				headers: headersJSON(),
			})
			
			alert('Заявка перейшла до сертифікаційних випробувань.')
			openApplication(applicationId)
		} else if (action === 'input_sampling_data') {
			// Ввод данных отбора образцов пошагово, как в certification_tests
			const code = prompt('Марка/модель продукції:', '')
			if (code === null) return
			if (!code.trim()) {
				alert('Марка/модель обов\'язкова')
				return
			}
			
			const serialNumber = prompt('Серійний номер зразка:', '')
			if (serialNumber === null) return
			if (!serialNumber.trim()) {
				alert('Серійний номер обов\'язковий')
				return
			}
			
			const quantity = prompt('Кількість зразків:', '')
			if (quantity === null) return
			if (!quantity.trim()) {
				alert('Кількість обов\'язкова')
				return
			}
			
			const storageConditions = prompt('Умови зберігання зразків:', '')
			if (storageConditions === null) return
			if (!storageConditions.trim()) {
				alert('Умови зберігання обов\'язкові')
				return
			}
			
			const sampleCode = prompt('Унікальний код зразка в системі:', '')
			if (sampleCode === null) return
			if (!sampleCode.trim()) {
				alert('Код зразка обов\'язковий')
				return
			}
			
			const samplingDate = prompt('Дата відбору (YYYY-MM-DD):', '')
			if (samplingDate === null) return
			if (!samplingDate.trim()) {
				alert('Дата відбору обов\'язкова')
				return
			}
			
			const samplingPlace = prompt('Місце відбору зразків:', '')
			if (samplingPlace === null) return
			if (!samplingPlace.trim()) {
				alert('Місце відбору обов\'язкове')
				return
			}
			
			const inspectorName = prompt('ПІБ та посада відповідального:', '')
			if (inspectorName === null) return
			if (!inspectorName.trim()) {
				alert('Відповідальний обов\'язковий')
				return
			}
			
			// Сохраняем данные
			try {
				await call(API.samplingData(applicationId), {
					method: 'POST',
					headers: headersJSON(),
					body: JSON.stringify({
						code: code.trim(),
						serialNumber: serialNumber.trim(),
						quantity: quantity.trim(),
						storageConditions: storageConditions.trim(),
						sampleCode: sampleCode.trim(),
						samplingDate: samplingDate.trim(),
						samplingPlace: samplingPlace.trim(),
						inspectorName: inspectorName.trim(),
						batchNumber: 'Партія'
					}),
				})
				alert('Дані відбору зразків збережено.')
				
				// Обновляем вид заявки чтобы показать новые действия
				openApplication(applicationId)
			} catch (err) {
				alert(err.message || 'Помилка збереження даних')
			}
        } else if (action === 'input_certification_data') {
			// Ввод данных сертификационных испытаний
			const protocolNumber = prompt('Номер протоколу:', '')
			if (protocolNumber === null) return
			const conductDate = prompt('Дата проведення (YYYY-MM-DD):', '')
			if (conductDate === null) return
			const organization = prompt('Організація/лабораторія:', '')
			if (organization === null) return
			const testMethod = prompt('Метод випробувань:', '')
			if (testMethod === null) return
			const result = prompt('Результат (відповідає/не відповідає стандарту):', 'відповідає')
			if (result === null) return
			const scoreInput = prompt('Оцінка (0-100):', '100')
			if (scoreInput === null) return
			
			const score = Number(scoreInput)
			if (isNaN(score) || score < 0 || score > 100) return alert('Невірне число (0-100)')
			
			try {
				await call(API.certificationData(applicationId), {
					method: 'POST',
					headers: headersJSON(),
					body: JSON.stringify({ 
						protocolNumber, conductDate, organization, testMethod, result, score 
					}),
				})
				alert('Дані сертифікаційних випробувань збережено')
				
				// Обновляем вид заявки чтобы показать новые действия
				logAction('Оновлюємо інтерфейс після збереження даних сертифікаційних випробувань', applicationId)
				openApplication(applicationId)
			} catch (err) {
				alert(err.message || 'Помилка збереження даних')
			}
        } else if (action === 'issue_protocols') {
			if (!confirm('Видати протоколи випробувань?')) return
			await call(API.issueProtocols(applicationId), {
				method: 'POST',
				headers: headersJSON(),
			})
		} else if (action === 'admin_force') {
			if (currentUser.role !== 'admin') return alert('Доступно тільки адміну')
			const toState = prompt('Цільовий стан (точно):')
			const reason = prompt('Причина:')
			if (!toState) return
			await call(API.adminForce, {
				method: 'POST',
				headers: headersJSON(),
				body: JSON.stringify({ applicationId, toState, reason }),
			})
        } else if (action === 'fix_production_errors') {
            // Оператор: подтверждение исправления ошибок
            const fixed = prompt('Ви виправили недоліки з минулої інспекції? (1 — так, 2 — ні):', '1')
            if (fixed === null) return
            if (Number(fixed) !== 1) {
                alert('Ви отримали припис про усунення. Змініть недоліки та спробуйте знову.')
                return
            }
            if (!confirm('Надіслати запит на повторну інспекцію інспектору?')) return
            await call(`/api/applications/${applicationId}/request-reinspection`, {
                method: 'POST',
                headers: headersJSON(),
                body: JSON.stringify({})
            })
            alert('Запит на повторну інспекцію надіслано інспектору')
        } else if (action === 'request_reinspection') {
            // Оператор: спочатку підтвердити усунення недоліків
            const fixed = prompt('Ви усунули недоліки з минулої інспекції? (1 — так, 2 — ні):', '1')
            if (fixed === null) return
            if (Number(fixed) !== 1) {
                alert('Ви отримали припис про усунення. Усуньте недоліки та спробуйте знову.')
                return
            }
            if (!confirm('Надіслати запит на повторну інспекцію інспектору?')) return
            await call(`/api/applications/${applicationId}/request-reinspection`, {
                method: 'POST',
                headers: headersJSON(),
                body: JSON.stringify({})
            })
            alert('Запит на повторну інспекцію надіслано інспектору')
        } else if (action === 'conduct_inspection_now') {
            // Инспектор: провести инспекцию сразу
            if (!confirm('Провести інспекцію зараз?')) return
            
            const docsOk = prompt('Документи (сертифікати, протоколи випробувань) відповідають нормі? (1 — так, 2 — ні):', '1')
            if (docsOk === null) return
            const processesOk = prompt('Виробничі процеси відповідають нормі? (1 — так, 2 — ні):', '1')
            if (processesOk === null) return
            const complianceOk = prompt('Відповідність продукції вимогам? (1 — так, 2 — ні):', '1')
            if (complianceOk === null) return

            await call(`/api/applications/${applicationId}/conduct-inspection`, {
                method: 'POST',
                headers: headersJSON(),
                body: JSON.stringify({
                    prodOk: Number(processesOk) === 1 ? 1 : 2,
                    qualityOk: Number(complianceOk) === 1 ? 1 : 2,
                    testsOk: Number(docsOk) === 1 ? 1 : 2,
                })
            })
            
            alert('Інспекцію проведено')
        } else {
			alert('Невідома дія: ' + action)
		}
		openApplication(applicationId)
	} catch (err) {
		alert(err.message || 'Дія не виконана')
	}
}

// Допоміжна функція для ваг тестів
function getTestWeight(testKey, productType) {
	const weights = {
		'doc_analysis': 1,
		'production_audit': 1,
		'production_attestation': 1,
		'management_system': 1
	}
	return weights[testKey] || 1
}

// інспекції
insCreate.addEventListener('click', async () => {
    try {
        const applicationId = insApp.value.trim()
        const date = insDate.value
        const place = document.getElementById('ins-place').value.trim()
        const responsible = insResp.value.trim()
        const notes = insNotes.value.trim()
        const type = insType.value
        const orderSigned = insOrder.checked
        
        // Отладочная информация
        console.log('Validation check:', {
            applicationId: applicationId,
            date: date,
            place: place,
            responsible: responsible,
            type: type
        })
        
        if (!applicationId || !date || !place || !responsible || !type) {
            alert(`Заповніть всі обов'язкові поля:\n- ID заявки: ${applicationId ? 'OK' : 'НЕ ЗАПОВНЕНО'}\n- Дата: ${date ? 'OK' : 'НЕ ЗАПОВНЕНО'}\n- Місце: ${place ? 'OK' : 'НЕ ЗАПОВНЕНО'}\n- Відповідальний: ${responsible ? 'OK' : 'НЕ ЗАПОВНЕНО'}\n- Тип: ${type ? 'OK' : 'НЕ ЗАПОВНЕНО'}`)
            return
        }
        
        // Проверяем существование заявки
        const appRes = await call(`/api/applications/${applicationId}`, { method: 'GET' })
        if (!appRes.application) {
            alert('Заявка з таким ID не знайдена')
            return
        }
        
        // Проверяем обязательную подпись наказа
        if (!orderSigned) {
            alert('Обов\'язково підпишіть наказ про проведення інспекції')
            return
        }
        
        const inspection = {
            applicationId,
            date,
            place,
            responsibleUserId: currentUser.id,
            responsibleName: responsible,
            notes,
            type,
            orderSigned,
            status: 'заплановано',
            createdAt: new Date().toISOString()
        }
        
        await call(API.planInsp(applicationId), { 
            method: 'POST', 
            headers: headersJSON(),
            body: JSON.stringify(inspection)
        })
        
        // Очищаем форму
        insApp.value = ''
        insDate.value = ''
        document.getElementById('ins-place').value = ''
        insResp.value = ''
        insNotes.value = ''
        insType.value = ''
        insOrder.checked = false
        
        alert('Інспекцію заплановано успішно!')
        
        // Обновляем списки
        await loadInspectionsPending()
        await loadInspectionsHistory()
        
    } catch (e) {
        if (e.message && e.message.includes('первинна інспекція')) {
            alert('Помилка: ' + e.message)
        } else {
            alert(e.message || 'Помилка при створенні інспекції')
        }
    }
})

async function loadInspections() {
	try {
		const res = await call(API.inspections, { method: 'GET' })
        if (insList) {
            insList.innerHTML = ''
        }
        // Форма планування
        // (уже є елементи ins-app, ins-date, ins-resp, ins-notes, ins-create)
        // Доповнюємо підказку
        const help = document.getElementById('ins-help')
        if (help) help.textContent = 'Планування інспекції: введіть ID заявки, дату, відповідального, тип інспекції (первинна/повторна/позапланова) і натисніть "Запланувати інспекцію". Заявка з\'явиться у розділі "Заявки на інспекцію" (список відсортовано за датою — від найближчих). Після перевірки зафіксуйте результат у картці заявки.'
	} catch (err) {
		alert(err.message || 'Не вдалося завантажити інспекції')
	}
}

// Завантаження очікуваних інспекцій (відсортовані за датою)
async function loadInspectionsPending() {
    try {
        // Проверяем, что элемент существует
        if (!insPendingList) {
            console.error('insPendingList element not found!')
            return
        }
        
        // Получаем заявки на инспекцию (status=pending)
        const res = await call(`${API.inspections}?status=pending`, { method: 'GET' })
        const applications = res.inspections || []
        
        if (applications.length === 0) {
            if (insPendingList) {
                insPendingList.innerHTML = '<div class="muted">Немає заявок на інспекцію</div>'
            }
            return
        }
        
        // Сортируем по дате создания (новые - выше)
        applications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        
        if (insPendingList) {
                    insPendingList.innerHTML = applications.map(application => {
            return `
                <div class="list-item">
                    <div>
                        <b>Заявка ${escapeHtml(application.id)}</b>
                        <div class="muted">Продукція: ${escapeHtml(application.productName)}</div>
                        <div class="muted">Тип продукції: ${escapeHtml(application.productType)}</div>
                        <div class="muted">Створено: ${new Date(application.createdAt).toLocaleDateString()}</div>
                        <div class="muted">Останнє оновлення: ${new Date(application.updatedAt).toLocaleDateString()}</div>
                    </div>
                    <div>
                        <button class="btn" onclick="openApplication('${application.id}')">Відкрити</button>
                        <button class="btn" onclick="denyInspection('${application.id}')" style="background-color: #dc3545;">Відмовити в інспекції</button>
                    </div>
                </div>
            `
        }).join('')
        }
        
    } catch (e) {
        console.error('Error in loadInspectionsPending:', e)
        if (insPendingList) {
            insPendingList.innerHTML = '<div class="error">Помилка завантаження: ' + e.message + '</div>'
        }
    }
}

// Покращення форматування логів та збереження тільки логів тут
async function loadLogs() {
    try {
        const res = await call(API.logs, { method: 'GET' })
        const logs = res.logs || []
        const rows = logs.slice(-500).reverse().map(l => {
            const time = new Date(l.timestamp || l.ts || Date.now()).toLocaleString()
            return `${time} | user:${l.userId} (${l.role}) | action:${l.action} | from:${l.fromState || ''} -> to:${l.toState || ''} | target:${l.targetId || ''} | note:${l.note || ''}`
        })
        if (logsArea) {
            logsArea.textContent = rows.join('\n')
        }
        
        // Показываем/скрываем кнопку очистки в зависимости от роли
        const clearLogsBtn = document.getElementById('clear-logs-btn')
        if (clearLogsBtn) {
            if (currentUser.role === 'operator') {
                clearLogsBtn.style.display = ''
                // Добавляем обработчик только один раз
                if (!clearLogsBtn.hasAttribute('data-handler-added')) {
                    clearLogsBtn.addEventListener('click', handleClearLogs)
                    clearLogsBtn.setAttribute('data-handler-added', 'true')
                }
            } else {
                clearLogsBtn.style.display = 'none'
            }
        }
    } catch (e) {
        alert('Не вдалося завантажити журнал')
    }
}

// Обработчик очистки журнала
async function handleClearLogs() {
    if (!confirm('Ви впевнені, що хочете очистити журнал дій?\n\n⚠️ УВАГА: Буде видалено всі записи, крім критично важних:\n• Створення заявок\n• Генерація сертифікатів\n• Реєстрація в реєстрі\n• Завершення інспекцій\n• Відхилення інспекцій\n• Примусові зміни адміністратора\n\nЦя дія незворотна!')) {
        return
    }
    
    try {
        const res = await call(API.clearLogs, { 
            method: 'POST', 
            headers: headersJSON() 
        })
        
        if (res.ok) {
            alert(`✅ ${res.message}\n\nВидалено: ${res.deleted} записів\nЗалишено: ${res.kept} критично важних записів`)
            // Перезагружаем журнал
            await loadLogs()
        } else {
            alert('Помилка очищення журналу')
        }
    } catch (e) {
        alert(e.message || 'Помилка очищення журналу')
    }
}

// Допоміжні тексти для видів інспектора
function setInspectorHelp() {
    if (!currentUser || currentUser.role !== 'inspector') return
    
    // Для раздела "Инспекции"
    const help1 = document.getElementById('ins-help')
    if (help1) help1.textContent = 'Як працює планування інспекції: 1) Вкажіть ID заявки, дату, відповідального та тип інспекції (первинна/повторна/позапланова). 2) Натисніть "Запланувати інспекцію" — заявка перейде у стан "План інспекції". 3) Після цього ви можете скасувати інспекцію ("Скасувати інспекцію"). 4) Під час завершення дайте відповіді на три пункти: Документи, Виробничі процеси, Відповідність продукції. Якщо всі відповіді "1" — сертифікат підтверджено, інакше сертифікат відкликано.'
    
    // Для раздела "Заявки на инспекцию"
    const help2 = document.getElementById('ins-pending-help')
    if (help2) help2.textContent = 'Тут показані заявки, що очікують проведення інспекції. Відкрийте заявку для детального перегляду, перенесіть інспекцію на іншу дату, проведіть її зараз або відмовте в інспекції з вказанням причини.'
}

// Підключення допомоги до навігації - прибираємо дублюючий виклик, так як він вже викликається в основному обробнику

// утиліти
function escapeHtml(s) {
	if (!s && s !== 0) return ''
	return String(s).replace(/[&<>"']/g, m => 
		({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
	)
}

// Забезпечення приховування картки звіту інспекції при переключенні видів
function hideInspectionReportCard() {
    const card = document.getElementById('ins-report-card')
    if (card) card.style.display = 'none'
}

// Відкриття інспекції для детального перегляду
async function openInspection(inspectionId) {
    try {
        hideInspectionReportCard()
        // Получаем все инспекции и находим нужную
        const res = await call(API.inspections, { method: 'GET' })
        const inspections = res.inspections || []
        const inspection = inspections.find(i => i.id === inspectionId)
        
        if (!inspection) {
            alert('Інспекцію не знайдено')
            return
        }
        
        // Показуємо лише форму акта та ховаємо інші секції
        showSection('ins-report-card')
        // При відкритті форми ховаємо кнопку "Скасувати інспекцію"
        const cancelBtnInForm2 = document.getElementById('cancel-inspection-btn')
        if (cancelBtnInForm2) cancelBtnInForm2.style.display = 'none'
        const reportCard = document.getElementById('ins-report-card')
        if (reportCard) {
            
            // Заполняем данные инспекции
            const placeField = document.getElementById('ins-report-place')
            if (placeField) {
                placeField.value = inspection.place || ''
            }
            
            const dateField = document.getElementById('ins-report-date')
            if (dateField) {
                dateField.value = inspection.date || ''
            }
            
            // Сохраняем ID инспекции для формы
            const reportForm = document.getElementById('ins-report-form')
            if (reportForm) {
                reportForm.dataset.inspectionId = inspectionId
            }
            
            // Загружаем существующие документы
            await loadDocumentsInForm(inspectionId)
        }
        
    } catch (e) {
        logAction('Помилка при відкритті інспекції', null, e.message)
        alert(e.message || 'Помилка при відкритті інспекції')
    }
}

// Відхилення інспекції для заявки
async function denyInspection(applicationId) {
    const reason = prompt('Причина відмови в інспекції:', '')
    if (reason === null || reason.trim() === '') return
    
    try {
        await call(`/api/applications/${applicationId}/deny-inspection`, { 
            method: 'POST', 
            headers: headersJSON(), 
            body: JSON.stringify({ reason: reason.trim() })
        })
        
        alert('Відмовлено в інспекції')
        await loadInspectionsPending()
        
    } catch (e) {
        alert(e.message || 'Помилка при відмові в інспекції')
    }
}

// Відхилення інспекції (для ID інспекції)
async function denyInspectionById(inspectionId) {
    const reason = prompt('Причина відмови в інспекції:', '')
    if (reason === null || reason.trim() === '') return
    
    try {
        await call(`/api/inspections/${inspectionId}/deny`, { 
            method: 'POST', 
            headers: headersJSON(),
            body: JSON.stringify({ reason: reason.trim() })
        })
        
        alert('Відмовлено в інспекції')
        await loadInspectionsPending()
        
    } catch (e) {
        alert(e.message || 'Помилка при відмові в інспекції')
    }
}

// Перенесення інспекції
async function rescheduleInspection(applicationId) {
    const newDate = prompt('Нова дата інспекції (YYYY-MM-DD):', '')
    if (newDate === null) return
    const d = (newDate || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        alert('Неможливо перенести. Вкажіть дату у форматі YYYY-MM-DD')
        return
    }
    const [y, m, day] = d.split('-').map(Number)
    if (m < 1 || m > 12 || day < 1 || day > 31) {
        alert('Неможливо перенести. Місяць має бути 01..12, день 01..31')
        return
    }
    
    // Спрашиваем про подпись наказа
    const orderSign = prompt('Введіть 1 - щоб електронно підписати проведення інспекції\nВведіть 2 - якщо відмовляєтесь від підписання проведення інспекції (інспекція не буде перенесена):', '')
    if (orderSign === null) return
    
    if (orderSign === '2') {
        alert('Інспекція не перенесена')
        return
    }
    
    if (orderSign !== '1') {
        alert('Невірний вибір. Спробуйте ще раз.')
        return
    }
    
    try {
        await call(`/api/applications/${applicationId}/reschedule-inspection`, {
            method: 'POST',
            headers: headersJSON(),
            body: JSON.stringify({ newDate: d, orderSigned: true })
        })
        
        alert('Інспекцію перенесено')
        await loadInspectionsPending()
        
    } catch (e) {
        alert(e.message || 'Помилка при перенесенні інспекції')
    }
}

// Проведення інспекції зараз
async function conductInspectionNow(applicationId) {
    
    try {
        // Показываем форму для проведения инспекции
        const docsOk = prompt('Документи (сертифікати, протоколи випробувань) відповідають нормі? (1 — так, 2 — ні):', '1')
        if (docsOk === null) return
        const processesOk = prompt('Виробничі процеси відповідають нормі? (1 — так, 2 — ні):', '1')
        if (processesOk === null) return
        const complianceOk = prompt('Відповідність продукції вимогам? (1 — так, 2 — ні):', '1')
        if (complianceOk === null) return

        await call(`/api/applications/${applicationId}/conduct-inspection`, {
            method: 'POST',
            headers: headersJSON(),
            body: JSON.stringify({
                prodOk: Number(processesOk) === 1 ? 1 : 2,
                qualityOk: Number(complianceOk) === 1 ? 1 : 2,
                testsOk: Number(docsOk) === 1 ? 1 : 2,
            })
        })
        
        alert('Інспекцію проведено')
        await loadInspectionsPending()
        await loadPlannedInspections()
        
    } catch (e) {
        alert(e.message || 'Помилка при проведенні інспекції')
    }
}

// Обробка подачі форми звіту інспекції
document.getElementById('ins-report-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    
    try {
        const inspectionId = e.target.dataset.inspectionId
        // собираем значения вручную, FormData не нужен
        const report = {
            inspectionId,
            location: document.getElementById('ins-report-place').value,
            participants: document.getElementById('ins-report-participants').value,
            results: document.getElementById('ins-report-results').value,
            conclusion: document.getElementById('ins-report-conclusion').value,
            inspectorSign: document.getElementById('ins-report-inspector-sign-status').textContent.includes('Підписано') ? 'Підписано інспектором' : '',
            clientSign: document.getElementById('ins-report-client-sign').value,
        }
        
        // Проверяем заполнение всех полей
        if (!report.location || !report.participants || !report.results || !report.conclusion || !report.inspectorSign || !report.clientSign) {
            alert('Заповніть всі обов\'язкові поля')
            return
        }
        
        // Сохраняем акт
        await call(`/api/inspections/${inspectionId}/report`, {
            method: 'POST',
            headers: headersJSON(),
            body: JSON.stringify(report)
        })
        
        // Отправляем файлы доказательств, если выбраны
        const evidenceInput = document.getElementById('ins-report-evidence')
        if (evidenceInput && evidenceInput.files && evidenceInput.files.length > 0) {
            let total = 0
            for (const f of evidenceInput.files) total += f.size
            if (total > 300 * 1024 * 1024) {
                alert('Загальний розмір файлів не може перевищувати 300 MB')
            } else {
                const form = new FormData()
                for (const f of evidenceInput.files) form.append('files', f)
                // Получаем applicationId из инспекции
                const inspectionsRes = await call(API.inspections, { method: 'GET' })
                const inspection = inspectionsRes.inspections.find(i => i.id === inspectionId)
                if (!inspection) {
                    alert('Помилка: Інспекцію не знайдено')
                    return
                }
                
                const applicationId = inspection.applicationId
                const resp = await fetch(`/api/applications/${applicationId}/upload-evidence`, { method: 'POST', body: form, headers: { Authorization: `Bearer ${token}` } })
                if (!resp.ok) {
                    try { const j = await resp.json(); alert(j.error || 'Помилка завантаження доказів') } catch { alert('Помилка завантаження доказів') }
                }
            }
        }

        alert('Акт інспекційної перевірки збережено!')
        
        // Скрываем форму
        document.getElementById('ins-report-card').style.display = 'none'
        
        // Обновляем списки
        await loadInspectionsPending()
        await loadInspectionsHistory()
        await loadPlannedInspections()
        
    } catch (e) {
        alert(e.message || 'Помилка при збереженні акту')
    }
})

// Скасування форми звіту інспекції
document.getElementById('ins-report-cancel').addEventListener('click', () => {
    document.getElementById('ins-report-card').style.display = 'none'
    // очищаем выбранные файлы
    const ev = document.getElementById('ins-report-evidence')
    if (ev) ev.value = ''
    const list = document.getElementById('ins-report-evidence-list')
    if (list) list.innerHTML = ''
    const fileStatus = document.getElementById('evidence-file-status')
    if (fileStatus) fileStatus.textContent = 'Файл не обрано'
})

// Обробка кнопки підпису інспектора у формі звіту
document.getElementById('ins-report-inspector-sign-btn').addEventListener('click', async () => {
    try {
        const statusDiv = document.getElementById('ins-report-inspector-sign-status')
        statusDiv.textContent = 'Підписано інспектором'
        statusDiv.style.color = '#28a745'
        statusDiv.style.fontWeight = 'bold'
        
        // Отключаем кнопку
        const btn = document.getElementById('ins-report-inspector-sign-btn')
        btn.disabled = true
        btn.textContent = 'Підписано'
        btn.style.backgroundColor = '#6c757d'
        
    } catch (e) {
        alert('Помилка при підписанні: ' + e.message)
    }
})

// Планування інспекції для заявки
async function planInspection(applicationId) {
    try {
        // Показываем форму планирования инспекции
        showSection('ins-card')
        
        // Заполняем ID заявки
        insApp.value = applicationId
        
        // Устанавливаем минимальную дату (сегодня)
        const today = new Date().toISOString().split('T')[0]
        insDate.min = today
        insDate.value = today
        
        // Фокус на дату
        insDate.focus()
        
    } catch (err) {
        alert(err.message || 'Помилка при плануванні інспекції')
    }
}

// Завантаження запланованих інспекцій з групуванням за датами
async function loadPlannedInspections() {
    try {
        // Проверяем, что элемент существует
        if (!insPlannedList) {
            logAction('Помилка: insPlannedList element not found!')
            return
        }
        
        // Получаем все запланированные инспекции
        const res = await call(API.inspections, { method: 'GET' })
        const inspections = res.inspections || []
        
        // Фильтруем только запланированные инспекции (исключаем завершенные, отмененные и проведенные)
        const planned = inspections.filter(i => 
            i.status === 'заплановано' && 
            i.status !== 'inspection_completed' && 
            i.status !== 'inspection_denied' &&
            i.status !== 'проведено' &&
            i.status !== 'скасовано'
        )
        
        if (planned.length === 0) {
            if (insPlannedList) {
                insPlannedList.innerHTML = '<div class="muted">Немає запланованих інспекцій</div>'
            }
            return
        }
        
        // Сортируем по дате (ближайшие - выше)
        planned.sort((a, b) => new Date(a.date) - new Date(b.date))
        
        // Группируем по датам
        const today = new Date().toISOString().split('T')[0]
        const grouped = {
            today: [],
            upcoming: [],
            past: []
        }
        
        planned.forEach(inspection => {
            const inspectionDate = inspection.date
            if (inspectionDate === today) {
                grouped.today.push(inspection)
            } else if (inspectionDate > today) {
                grouped.upcoming.push(inspection)
            } else {
                grouped.past.push(inspection)
            }
        })
        
        // Формируем HTML
        let html = ''
        
        // Сегодняшние инспекции
        if (grouped.today.length > 0) {
            html += '<div class="date-group today">'
            html += '<h4 style="color: #dc3545; margin: 16px 0 8px 0;">Сьогодні:</h4>'
            html += grouped.today.map(inspection => createInspectionItem(inspection)).join('')
            html += '</div>'
        }
        
        // Предстоящие инспекции
        if (grouped.upcoming.length > 0) {
            html += '<div class="date-group upcoming">'
            html += '<h4 style="color: #28a745; margin: 16px 0 8px 0;">Майбутні:</h4>'
            html += grouped.upcoming.map(inspection => createInspectionItem(inspection)).join('')
            html += '</div>'
        }
        
        // Прошедшие инспекции (если есть)
        if (grouped.past.length > 0) {
            html += '<div class="date-group past">'
            html += '<h4 style="color: #ffc107; margin: 16px 0 8px 0;">Протерміновані:</h4>'
            html += grouped.past.map(inspection => createInspectionItem(inspection)).join('')
            html += '</div>'
        }
        
        if (insPlannedList) {
            insPlannedList.innerHTML = html
        }
        
    } catch (e) {
        console.error('Error in loadPlannedInspections:', e)
        if (insPlannedList) {
            insPlannedList.innerHTML = '<div class="error">Помилка завантаження: ' + e.message + '</div>'
        }
    }
}

// Допоміжна функція для створення HTML елемента інспекції
function createInspectionItem(inspection) {
    return `
        <div class="list-item" style="border-left: 4px solid #ffc107;">
            <div>
                <b>Інспекція ${escapeHtml(inspection.id)}</b>
                <div class="muted">Дата: ${inspection.date} | Місце: ${escapeHtml(inspection.place || 'Не вказано')}</div>
                <div class="muted">Тип: ${escapeHtml(inspection.type)} | Відповідальний: ${escapeHtml(inspection.responsibleName)}</div>
                ${inspection.notes ? `<div class="muted">Примітки: ${escapeHtml(inspection.notes)}</div>` : ''}
            </div>
            <div>
                <button class="btn" onclick="openApplication('${inspection.applicationId}')">Відкрити</button>
                <button class="btn" onclick="editPlannedInspection('${inspection.id}')" style="background-color: #17a2b8;">Перенести</button>
                <button class="btn" onclick="cancelInspection('${inspection.id}')" style="background-color: #dc3545;">Скасувати</button>
            </div>
        </div>
    `
}

// Завершення інспекції
async function completeInspection(inspectionId) {
    try {
        // Получаем данные инспекции
        const res = await call(API.inspections, { method: 'GET' })
        const inspections = res.inspections || []
        const inspection = inspections.find(i => i.id === inspectionId)
        
        if (!inspection) {
            alert('Інспекцію не знайдено')
            return
        }
        
        // Показываем форму акта
        showSection('ins-report-card')
        // При відкритті форми ховаємо кнопку "Скасувати інспекцію"
        const cancelBtnInForm1 = document.getElementById('cancel-inspection-btn')
        if (cancelBtnInForm1) cancelBtnInForm1.style.display = 'none'
        
        // Заполняем данные инспекции
        const placeField = document.getElementById('ins-report-place')
        if (placeField) {
            placeField.value = inspection.place || ''
        }
        
        const dateField = document.getElementById('ins-report-date')
        if (dateField) {
            dateField.value = inspection.date || ''
        }
        
        // Сохраняем ID инспекции для формы
        const reportForm = document.getElementById('ins-report-form')
        if (reportForm) {
            reportForm.dataset.inspectionId = inspectionId
        }
        
        // Загружаем существующие документы
        await loadDocumentsInForm(inspectionId)
        
        // Сбрасываем подписи для новой инспекции
        const inspectorSignBtn = document.getElementById('ins-report-inspector-sign-btn')
        if (inspectorSignBtn) {
            inspectorSignBtn.disabled = false
            inspectorSignBtn.textContent = 'Підписати інспекцію'
            inspectorSignBtn.style.backgroundColor = '#007bff'
        }
        
        const applicantSignBtn = document.getElementById('ins-report-applicant-sign-btn')
        if (applicantSignBtn) {
            applicantSignBtn.disabled = false
            applicantSignBtn.textContent = 'Підписати заявника'
            applicantSignBtn.style.backgroundColor = '#007bff'
        }
        
        // Отладочная информация
        console.log('Form opened for inspection:', inspectionId)
        
    } catch (e) {
        logAction('Помилка при завершенні інспекції', null, e.message)
        alert(e.message || 'Помилка при завершенні інспекції')
    }
}

// Скасування інспекції
async function cancelInspection(inspectionId) {
    if (!confirm('Ви впевнені, що хочете скасувати цю інспекцію?')) return
    
    try {
        // Обновляем статус инспекции на "скасовано"
        await call(`/api/inspections/${inspectionId}/cancel`, {
            method: 'POST',
            headers: headersJSON(),
        })
        
        alert('Інспекцію скасовано')
        
        // Обновляем список
        await loadPlannedInspections()
        
    } catch (e) {
        logAction('Помилка при скасуванні інспекції', inspectionId, e.message)
        alert(e.message || 'Помилка при скасуванні інспекції')
    }
}

// Редагування/Перенесення запланованої інспекції
async function editPlannedInspection(inspectionId) {
    try {
        // Получаем данные инспекции
        const res = await call(API.inspections, { method: 'GET' })
        const inspections = res.inspections || []
        const inspection = inspections.find(i => i.id === inspectionId)
        
        if (!inspection) {
            alert('Інспекцію не знайдено')
            return
        }
        
        // Показываем форму планирования инспекции (тільки її)
        showSection('ins-card')
        
        // Заполняем данные инспекции
        insApp.value = inspection.applicationId
        insDate.value = inspection.date
        document.getElementById('ins-place').value = inspection.place || ''
        insResp.value = inspection.responsibleName || ''
        insNotes.value = inspection.notes || ''
        insType.value = inspection.type || ''
        insOrder.checked = inspection.orderSigned || false
        
        // Добавляем кнопку "Оновити інспекцію" вместо "Запланувати інспекцію"
        const createBtn = document.getElementById('ins-create')
        if (createBtn) {
            createBtn.textContent = 'Оновити інспекцію'
            createBtn.onclick = () => updateInspection(inspectionId)
            // Сохраняем оригинальный обработчик
            createBtn.dataset.originalOnclick = 'true'
        }
        
        // Сохраняем ID инспекции для обновления
        document.getElementById('ins-card').dataset.editingInspectionId = inspectionId
        
    } catch (e) {
        logAction('Помилка при редагуванні інспекції', inspectionId, e.message)
        alert(e.message || 'Помилка при редагуванні інспекції')
    }
}

// Оновлення інспекції
async function updateInspection(inspectionId) {
    try {
        // Получаем ID инспекции из dataset формы
        const editingInspectionId = document.getElementById('ins-card').dataset.editingInspectionId
        if (!editingInspectionId) {
            alert('Помилка: ID інспекції для оновлення не знайдено')
            return
        }
        
        const applicationId = insApp.value.trim()
        const date = insDate.value
        const place = document.getElementById('ins-place').value.trim()
        const responsible = insResp.value.trim()
        const notes = insNotes.value.trim()
        const type = insType.value
        const orderSigned = insOrder.checked
        
        // Отладочная информация
        console.log('Update validation check:', {
            applicationId: applicationId,
            date: date,
            place: place,
            responsible: responsible,
            type: type
        })
        
        if (!applicationId || !date || !place || !responsible || !type) {
            alert(`Заповніть всі обов'язкові поля:\n- ID заявки: ${applicationId ? 'OK' : 'НЕ ЗАПОВНЕНО'}\n- Дата: ${date ? 'OK' : 'НЕ ЗАПОВНЕНО'}\n- Місце: ${place ? 'OK' : 'НЕ ЗАПОВНЕНО'}\n- Відповідальний: ${responsible ? 'OK' : 'НЕ ЗАПОВНЕНО'}\n- Тип: ${type ? 'OK' : 'НЕ ЗАПОВНЕНО'}`)
            return
        }
        
        // Проверяем обязательную подпись наказа
        if (!orderSigned) {
            alert('Обов\'язково підпишіть наказ про проведення інспекції')
            return
        }
        
        const inspection = {
            date,
            place,
            responsibleName: responsible,
            notes,
            type,
            orderSigned,
            updatedAt: new Date().toISOString()
        }
        
        await call(`/api/inspections/${editingInspectionId}`, { 
            method: 'PUT', 
            headers: headersJSON(),
            body: JSON.stringify(inspection)
        })
        
        alert('Інспекцію оновлено успішно!')
        
        // Восстанавливаем обычную кнопку
        const createBtn = document.getElementById('ins-create')
        if (createBtn) {
            createBtn.textContent = 'Запланувати інспекцію'
            // Восстанавливаем оригинальный обработчик
            if (createBtn.dataset.originalOnclick) {
                createBtn.onclick = null
                delete createBtn.dataset.originalOnclick
            }
        }
        
        // Очищаем форму
        insApp.value = ''
        insDate.value = ''
        document.getElementById('ins-place').value = ''
        insResp.value = ''
        insNotes.value = ''
        insType.value = ''
        insOrder.checked = false
        
        // Обновляем списки
        await loadPlannedInspections()
        
    } catch (e) {
        alert(e.message || 'Помилка при оновленні інспекції')
    }
}

// Функция для показа только одной секции
function showSection(sectionId) {
    // Скрываем все карточки
    const allCards = [
        'create-card', 'list-card', 'detail-card', 'ins-card', 
        'ins-pending-card', 'ins-planned-card', 'ins-history-card', 
        'ins-report-card', 'documents-card', 'logs-card', 'users-card'
    ]
    
    allCards.forEach(cardId => {
        const card = document.getElementById(cardId)
        if (card) {
            card.style.display = 'none'
        }
    })
    
    // Показываем только нужную секцию
    const targetCard = document.getElementById(sectionId)
    if (targetCard) {
        targetCard.style.display = 'block'
        console.log(`Показано секцію: ${sectionId}`)
    } else {
        console.error(`Секція не знайдена: ${sectionId}`)
    }
}

// Обробка кнопки вибору файлу доказів у формі звіту
document.getElementById('pick-evidence-file').addEventListener('click', () => {
    const evidenceInput = document.getElementById('ins-report-evidence')
    evidenceInput.click()
})

// Обробка вибору файлу доказів у формі звіту
document.getElementById('ins-report-evidence').addEventListener('change', () => {
    const evidenceInput = document.getElementById('ins-report-evidence')
    const evidenceList = document.getElementById('ins-report-evidence-list')
    const fileStatus = document.getElementById('evidence-file-status')
    
    if (evidenceInput.files && evidenceInput.files.length > 0) {
        const files = evidenceInput.files
        let totalSize = 0
        
        // Проверяем размер файлов
        for (let file of files) {
            totalSize += file.size
        }
        
        if (totalSize > 300 * 1024 * 1024) {
            alert('Загальний розмір файлів не може перевищувати 300 MB')
            evidenceInput.value = ''
            fileStatus.textContent = 'Файл не обрано'
            evidenceList.innerHTML = ''
            return
        }
        
        // Показываем выбранные файлы
        let fileList = ''
        for (let file of files) {
            const fileSize = Math.round(file.size / 1024 / 1024 * 100) / 100
            fileList += `
                <div class="evidence-file-item">
                    <div class="evidence-file-info">
                        <span class="evidence-file-icon">📄</span>
                        <span class="evidence-file-name">${escapeHtml(file.name)}</span>
                        <span class="evidence-file-size">${fileSize} MB</span>
                    </div>
                </div>
            `
        }
        
        evidenceList.innerHTML = fileList
        fileStatus.textContent = `Обрано ${files.length} файл(ів)`
        
    } else {
        evidenceList.innerHTML = ''
        fileStatus.textContent = 'Файл не обрано'
    }
})

// Обробка кнопки завантаження доказів у формі звіту
document.getElementById('ins-report-upload-evidence').addEventListener('click', async () => {
    try {
        const evidenceInput = document.getElementById('ins-report-evidence')
        const evidenceList = document.getElementById('ins-report-evidence-list')
        const fileStatus = document.getElementById('evidence-file-status')
        
        if (!evidenceInput.files || evidenceInput.files.length === 0) {
            alert('Оберіть файли для завантаження')
            return
        }
        
        // Проверяем размер файлов
        let totalSize = 0
        for (const file of evidenceInput.files) {
            totalSize += file.size
        }
        
        if (totalSize > 300 * 1024 * 1024) {
            alert('Загальний розмір файлів не може перевищувати 300 MB')
            return
        }
        
        // Загружаем файлы
        const form = new FormData()
        for (const file of evidenceInput.files) {
            form.append('files', file)
        }
        
        const inspectionId = document.getElementById('ins-report-form').dataset.inspectionId
        if (!inspectionId) {
            alert('Помилка: ID інспекції не знайдено')
            return
        }
        
        // Получаем applicationId из инспекции
        const inspectionsRes = await call(API.inspections, { method: 'GET' })
        const inspection = inspectionsRes.inspections.find(i => i.id === inspectionId)
        if (!inspection) {
            alert('Помилка: Інспекцію не знайдено')
            return
        }
        
        const applicationId = inspection.applicationId
        const response = await fetch(`/api/applications/${applicationId}/upload-evidence`, {
            method: 'POST',
            body: form,
            headers: { Authorization: `Bearer ${token}` }
        })
        
        if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Помилка завантаження')
        }
        
        alert('Файли завантажено успішно!')
        
        // Очищаем поле выбора файлов
        evidenceInput.value = ''
        fileStatus.textContent = 'Файл не обрано'
        
        // Обновляем список документов прямо в форме
        await loadDocumentsInForm(inspectionId)
        
        // Показываем сообщение об успешной загрузке поверх списка документов
        const evidenceStatusList = document.getElementById('ins-report-evidence-list')
        if (evidenceStatusList) {
            const successMessage = document.createElement('div')
            successMessage.innerHTML = '<div class="muted" style="color: #28a745; margin-bottom: 12px;">✅ Файли завантажено успішно!</div>'
            evidenceStatusList.insertBefore(successMessage, evidenceStatusList.firstChild)
        }
        
        // Принудительно обновляем список документов
        console.log('Forcing document list refresh...')
        setTimeout(() => loadDocumentsInForm(inspectionId), 500)
        
    } catch (e) {
        alert('Помилка при завантаженні файлів: ' + e.message)
    }
})

// Завантаження документів для інспекції
async function loadDocuments(inspectionId) {
    try {
        const documentsList = document.getElementById('documents-list')
        if (!documentsList) return
        
        // Получаем заявку с документами
        const response = await call(`/api/applications/${inspectionId}`, { method: 'GET' })
        const application = response.application
        
        if (!application || !application.inspectionEvidence || application.inspectionEvidence.length === 0) {
            documentsList.innerHTML = '<div class="muted">Немає завантажених документів</div>'
            return
        }
        
        // Отображаем документы
        let html = '<div class="documents-grid">'
        application.inspectionEvidence.forEach((file, index) => {
            const fileSize = Math.round(file.size / 1024 / 1024 * 100) / 100
            const uploadTime = new Date(file.uploadedAt || Date.now()).toLocaleString()
            
            html += `
                <div class="document-item">
                    <div class="document-icon">📄</div>
                    <div class="document-info">
                        <div class="document-name">${escapeHtml(file.originalName)}</div>
                        <div class="document-meta">
                            <span class="document-size">${fileSize} MB</span>
                            <span class="document-time">${uploadTime}</span>
                        </div>
                    </div>
                    <div class="document-actions">
                        <button class="btn btn-small" onclick="downloadDocument('${file.path}', '${file.originalName}')">Завантажити</button>
                        <button class="btn btn-small btn-danger" onclick="deleteDocument('${inspectionId}', ${index})">Видалити</button>
                    </div>
                </div>
            `
        })
        html += '</div>'
        
        documentsList.innerHTML = html
        
    } catch (e) {
        console.error('Error loading documents:', e)
        const documentsList = document.getElementById('documents-list')
        if (documentsList) {
            documentsList.innerHTML = '<div class="error">Помилка завантаження документів: ' + e.message + '</div>'
        }
    }
}

// Завантаження документів безпосередньо у формі
async function loadDocumentsInForm(inspectionId) {
    try {
        const evidenceList = document.getElementById('ins-report-evidence-list')
        if (!evidenceList) return
        
        // Получаем applicationId из инспекции
        const inspectionsRes = await call(API.inspections, { method: 'GET' })
        const inspection = inspectionsRes.inspections.find(i => i.id === inspectionId)
        if (!inspection) {
            console.error('Inspection not found:', inspectionId)
            return
        }
        
        const applicationId = inspection.applicationId
        
        // Получаем заявку с документами
        const response = await call(`/api/applications/${applicationId}`, { method: 'GET' })
        const application = response.application
        
        console.log('Loading documents for application:', applicationId, application)
        console.log('Application inspectionEvidence:', application?.inspectionEvidence)
        
        if (!application) {
            evidenceList.innerHTML = '<div class="error">Заявку не знайдено</div>'
            return
        }
        
        if (!application.inspectionEvidence || application.inspectionEvidence.length === 0) {
            evidenceList.innerHTML = '<div class="muted">Немає завантажених документів</div>'
            return
        }
        
        console.log('Found evidence files:', application.inspectionEvidence)
        
        // Отображаем документы прямо в форме
        let html = '<div style="margin-top: 12px;"><strong>Завантажені документи:</strong></div>'
        application.inspectionEvidence.forEach((file, index) => {
            const fileSize = Math.round(file.size / 1024 / 1024 * 100) / 100
            const uploadTime = new Date(file.uploadedAt || Date.now()).toLocaleString('uk-UA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })
            
            html += `
                <div class="evidence-file-item">
                    <div class="evidence-file-info">
                        <span class="evidence-file-icon">📄</span>
                        <span class="evidence-file-name">${escapeHtml(file.originalName)}</span>
                        <span class="evidence-file-size">${fileSize} MB</span>
                        <span class="evidence-file-time">${uploadTime}</span>
                    </div>
                    <div class="evidence-file-actions">
                        <button class="btn btn-small" onclick="downloadDocument('${file.path}', '${file.originalName}')">Завантажити</button>
                        <button class="btn btn-small btn-danger" onclick="deleteDocumentFromForm('${inspectionId}', ${index})">Видалити</button>
                    </div>
                </div>
            `
        })
        
        evidenceList.innerHTML = html
        
    } catch (e) {
        console.error('Error loading documents in form:', e)
        const evidenceList = document.getElementById('ins-report-evidence-list')
        if (evidenceList) {
            evidenceList.innerHTML = '<div class="error">Помилка завантаження документів: ' + e.message + '</div>'
        }
    }
}

// Видалення документа з форми
async function deleteDocumentFromForm(inspectionId, fileIndex) {
    if (!confirm('Ви впевнені, що хочете видалити цей документ?')) return
    
    try {
        // Получаем applicationId из инспекции
        const inspectionsRes = await call(API.inspections, { method: 'GET' })
        const inspection = inspectionsRes.inspections.find(i => i.id === inspectionId)
        if (!inspection) {
            alert('Помилка: Інспекцію не знайдено')
            return
        }
        
        const applicationId = inspection.applicationId
        
        await call(`/api/applications/${applicationId}/delete-evidence`, {
            method: 'DELETE',
            headers: headersJSON(),
            body: JSON.stringify({ fileIndex })
        })
        
        alert('Документ видалено')
        await loadDocumentsInForm(inspectionId)
        
    } catch (e) {
        alert('Помилка при видаленні документа: ' + e.message)
    }
}

// Завантаження документа
function downloadDocument(filePath, fileName) {
    const link = document.createElement('a')
    link.href = filePath
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}

// Видалення документа
async function deleteDocument(inspectionId, fileIndex) {
    if (!confirm('Ви впевнені, що хочете видалити цей документ?')) return
    
    try {
        await call(`/api/applications/${inspectionId}/delete-evidence`, {
            method: 'DELETE',
            headers: headersJSON(),
            body: JSON.stringify({ fileIndex })
        })
        
        alert('Документ видалено')
        await loadDocuments(inspectionId)
        
    } catch (e) {
        alert('Помилка при видаленні документа: ' + e.message)
    }
}

// Оновлення списку документів
document.getElementById('refresh-documents-btn').addEventListener('click', async () => {
    const inspectionId = document.getElementById('ins-report-form').dataset.inspectionId
    if (inspectionId) {
        await loadDocuments(inspectionId)
    }
})

// Повернення до форми звіту
document.getElementById('back-to-report-btn').addEventListener('click', () => {
    showSection('ins-report-card')
})

// Проведення інспекції з форми звіту
document.getElementById('conduct-inspection-btn').addEventListener('click', async () => {
    try {
        const inspectionId = document.getElementById('ins-report-form').dataset.inspectionId
        if (!inspectionId) {
            alert('Помилка: ID інспекції не знайдено')
            return
        }
        
        // Проводим инспекцию
        await call(`/api/inspections/${inspectionId}/complete`, {
            method: 'POST',
            headers: headersJSON(),
            body: JSON.stringify({
                result: 'відповідає',
                notes: 'Інспекцію проведено через форму акта'
            })
        })
        
        alert('Інспекцію проведено успішно! Тепер потрібно підписати інспекцію.')
        
        // Обновляем статус кнопок подписи
        const inspectorSignBtn = document.getElementById('ins-report-inspector-sign-btn')
        if (inspectorSignBtn) {
            inspectorSignBtn.disabled = false
            inspectorSignBtn.textContent = 'Підписати інспекцію'
            inspectorSignBtn.style.backgroundColor = '#007bff'
        }
        
        const inspectorSignStatus = document.getElementById('ins-report-inspector-sign-status')
        if (inspectorSignStatus) {
            inspectorSignStatus.textContent = 'Інспекцію проведено. Потрібно підписати.'
            inspectorSignStatus.style.color = '#28a745'
        }
        
        // Показываем сообщение о необходимости подписи
        const evidenceList = document.getElementById('ins-report-evidence-list')
        if (evidenceList) {
            evidenceList.innerHTML = `
                <div style="margin-top: 12px; padding: 12px; background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; color: #155724;">
                    <strong>✅ Інспекцію проведено успішно!</strong><br>
                    Тепер потрібно заново підписати інспекцію інспектором та заявником.
                </div>
            `
        }
        
        // Сбрасываем подписи для новой инспекции
        if (inspectorSignBtn) {
            inspectorSignBtn.disabled = false
            inspectorSignBtn.textContent = 'Підписати інспекцію'
            inspectorSignBtn.style.backgroundColor = '#007bff'
        }
        
        const applicantSignBtn = document.getElementById('ins-report-applicant-sign-btn')
        if (applicantSignBtn) {
            applicantSignBtn.disabled = false
            applicantSignBtn.textContent = 'Підписати заявника'
            applicantSignBtn.style.backgroundColor = '#007bff'
        }
        
        // Скрываем форму акта и возвращаемся к списку
        showSection('ins-planned-card')
        await loadPlannedInspections()
        
    } catch (e) {
        alert('Помилка при проведенні інспекції: ' + e.message)
    }
})

// Скасування інспекції з форми звіту
document.getElementById('cancel-inspection-btn').addEventListener('click', async () => {
    try {
        const inspectionId = document.getElementById('ins-report-form').dataset.inspectionId
        if (!inspectionId) {
            alert('Помилка: ID інспекції не знайдено')
            return
        }
        
        if (!confirm('Ви впевнені, що хочете скасувати цю інспекцію?')) {
            return
        }
        
        // Скасываем инспекцию
        await call(`/api/inspections/${inspectionId}/cancel`, {
            method: 'POST',
            headers: headersJSON()
        })
        
        alert('Інспекцію скасовано')
        
        // Скрываем форму акта
        showSection('ins-planned-card')
        
        // Обновляем список запланированных инспекций
        await loadPlannedInspections()
        
    } catch (e) {
        alert('Помилка при скасуванні інспекції: ' + e.message)
    }
})









// ===== Управление пользователями =====

// Обработчик для кнопки "Користувачі"
if (navUsers) {
    navUsers.addEventListener('click', async () => {
        await loadUsers()
        showSection('users-card')
    })
}

// Загрузка списка пользователей
async function loadUsers() {
	try {
		const res = await call(API.users, { method: 'GET' })
		const users = res.users || []
		
		const usersList = document.getElementById('users-list')
		if (!usersList) {
			console.error('users-list element not found!')
			return
		}
		
		if (users.length === 0) {
			usersList.innerHTML = '<div class="muted">Користувачів не знайдено</div>'
			return
		}
        
        let html = '<div class="users-table">'
        html += '<table style="width: 100%; border-collapse: collapse; border: 2px solid #333;">'
        html += '<thead><tr style="background: #2c3e50; color: white;">'
        html += '<th style="padding: 12px; border: 1px solid #ddd;">ID</th>'
        html += '<th style="padding: 12px; border: 1px solid #ddd;">Ім\'я (Нік)</th>'
        html += '<th style="padding: 12px; border: 1px solid #ddd;">Логін (Email)</th>'
        html += '<th style="padding: 12px; border: 1px solid #ddd;">Пароль</th>'
        html += '<th style="padding: 12px; border: 1px solid #ddd;">Роль</th>'
        html += '<th style="padding: 12px; border: 1px solid #ddd;">Дата створення</th>'
        html += '<th style="padding: 12px; border: 1px solid #ddd;">Останній вхід</th>'
        html += '<th style="padding: 12px; border: 1px solid #ddd;">Дії</th>'
        html += '</tr></thead><tbody>'
        
        users.forEach(user => {
            const roleUA = roleTranslations[user.role] || user.role
            const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString('uk-UA') : 'Не вказано'
            const isCurrentUser = user.id === currentUser.id
            
            // Отримуємо останній вхід з даних користувача
            const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleDateString('uk-UA') + ' ' + new Date(user.lastLogin).toLocaleTimeString('uk-UA', {hour: '2-digit', minute: '2-digit'}) : 'Не відомо'
            
            html += '<tr style="background: ' + (isCurrentUser ? '#e8f4fd' : '#fff') + '">'
            html += `<td style="padding: 10px; border: 1px solid #ddd; font-family: monospace;">${escapeHtml(user.id)}</td>`
            html += `<td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">${escapeHtml(user.name)}</td>`
            html += `<td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(user.email)}</td>`
            html += `<td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; background-color: #f8f9fa;">${escapeHtml(user.password || '')}</td>`
            html += `<td style="padding: 10px; border: 1px solid #ddd;"><span class="role-badge role-${user.role}">${escapeHtml(roleUA)}</span></td>`
            html += `<td style="padding: 10px; border: 1px solid #ddd;">${createdAt}</td>`
            html += `<td style="padding: 10px; border: 1px solid #ddd;">${lastLogin}</td>`
            html += '<td style="padding: 10px; border: 1px solid #ddd;">'
            
            if (!isCurrentUser) {
                html += `<button class="btn btn-small" onclick="editUserId('${user.id}')" style="margin-right: 5px; background-color: #fd7e14;">Змінити ID</button>`
                html += `<button class="btn btn-small" onclick="editUserName('${user.id}', '${escapeHtml(user.name)}')" style="margin-right: 5px; background-color: #17a2b8;">Змінити ім'я</button>`
                html += `<button class="btn btn-small" onclick="editUserEmail('${user.id}', '${escapeHtml(user.email)}')" style="margin-right: 5px; background-color: #28a745;">Змінити логін</button>`
                html += `<button class="btn btn-small" onclick="changeUserPassword('${user.id}')" style="margin-right: 5px; background-color: #ffc107; color: #000;">Змінити пароль</button>`
                html += `<button class="btn btn-small" onclick="changeUserRole('${user.id}', '${user.role}')" style="margin-right: 5px; background-color: #6f42c1;">Змінити роль</button>`
                html += `<button class="btn btn-small" onclick="deleteUser('${user.id}')" style="background-color: #dc3545;">Видалити</button>`
            } else {
                html += '<span class="muted" style="color: #6c757d; font-style: italic;">Поточний користувач</span>'
            }
            
            html += '</td></tr>'
        })
        
        html += '</tbody></table></div>'
        
        // Додаємо стилі для ролей
        html += '<style>'
        html += '.role-badge { padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; color: white; }'
        html += '.role-admin { background-color: #dc3545; }'
        html += '.role-operator { background-color: #007bff; }'
        html += '.role-inspector { background-color: #28a745; }'
        html += '.role-applicant { background-color: #6c757d; }'
        html += '</style>'
        
        usersList.innerHTML = html
        
    } catch (err) {
        console.error('Error loading users:', err)
        alert('Помилка при завантаженні користувачів: ' + err.message)
    }
}





// Змінити ім'я користувача
async function editUserName(userId, currentName) {
    const newName = prompt('Введіть нове ім\'я користувача:', currentName)
    if (!newName || newName.trim() === '') return
    
    try {
        await call(API.changeUserName(userId), {
            method: 'PUT',
            headers: headersJSON(),
            body: JSON.stringify({ name: newName.trim() })
        })
        
        showNotification('Ім\'я користувача успішно змінено', 'success')
        await loadUsers() // Оновлюємо список
        
    } catch (err) {
        console.error('Error changing user name:', err)
        alert('Помилка при зміні імені: ' + err.message)
    }
}

// Змінити email користувача
async function editUserEmail(userId, currentEmail) {
    const newEmail = prompt('Введіть новий email користувача:', currentEmail)
    if (!newEmail || newEmail.trim() === '') return
    
    try {
        await call(API.changeUserEmail(userId), {
            method: 'PUT',
            headers: headersJSON(),
            body: JSON.stringify({ email: newEmail.trim() })
        })
        
        showNotification('Email користувача успішно змінено', 'success')
        await loadUsers() // Оновлюємо список
        
    } catch (err) {
        console.error('Error changing user email:', err)
        alert('Помилка при зміні email: ' + err.message)
    }
}

// Змінити ID користувача
async function editUserId(userId) {
    const newId = prompt('Зміна ID - призведе до втрати всіх заявок з історії у акаунта, але залишаться в історії у керівних акаунтів. Тому небажано змінювати ID!\n\nВведіть новий ID користувача:', userId)
    if (!newId || newId.trim() === '') return
    
    try {
        await call(API.changeUserId(userId), {
            method: 'PUT',
            headers: headersJSON(),
            body: JSON.stringify({ newId: newId.trim() })
        })
        
        showNotification('ID користувача успішно змінено', 'success')
        await loadUsers() // Оновлюємо список
        
    } catch (err) {
        console.error('Error changing user ID:', err)
        alert('Помилка при зміні ID: ' + err.message)
    }
}

// Изменить пароль пользователя
async function changeUserPassword(userId) {
    const newPassword = prompt('Введіть новий пароль:')
    if (!newPassword) return
    
    try {
        await call(API.changePassword(userId), {
            method: 'PUT',
            headers: headersJSON(),
            body: JSON.stringify({ password: newPassword })
        })
        
        showNotification('Пароль успішно змінено', 'success')
        await loadUsers() // Обновляем список
        
    } catch (err) {
        console.error('Error changing password:', err)
        alert('Помилка при зміні пароля: ' + err.message)
    }
}

// Изменить роль пользователя
async function changeUserRole(userId, currentRole) {
    const roleOptions = {
        'applicant': 'Заявник',
        'operator': 'Оператор', 
        'inspector': 'Інспектор',
        'admin': 'Адміністратор'
    }
    
    const currentRoleUA = roleOptions[currentRole] || currentRole
    const newRole = prompt(`Поточна роль: ${currentRoleUA}\n\nВведіть нову роль:\n- applicant (Заявник)\n- operator (Оператор)\n- inspector (Інспектор)\n- admin (Адміністратор)`)
    
    if (!newRole || !['applicant', 'operator', 'inspector', 'admin'].includes(newRole)) {
        alert('Недійсна роль. Дозволені: applicant, operator, inspector, admin')
        return
    }
    
    try {
        await call(API.changeRole(userId), {
            method: 'PUT',
            headers: headersJSON(),
            body: JSON.stringify({ role: newRole })
        })
        
        showNotification('Роль успішно змінено', 'success')
        await loadUsers() // Обновляем список
        
    } catch (err) {
        console.error('Error changing role:', err)
        alert('Помилка при зміні ролі: ' + err.message)
    }
}

// Удалить пользователя
async function deleteUser(userId) {
    if (!confirm('Ви впевнені, що хочете видалити цього користувача?')) {
        return
    }
    
    try {
        await call(API.deleteUser(userId), {
            method: 'DELETE',
            headers: headersJSON()
        })
        
        showNotification('Користувача успішно видалено', 'success')
        await loadUsers() // Обновляем список
        
    } catch (err) {
        console.error('Error deleting user:', err)
        alert('Помилка при видаленні користувача: ' + err.message)
    }
}

// Обработчик для создания нового пользователя
const createUserForm = document.getElementById('create-user-form')
if (createUserForm) {
    createUserForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        
        const userId = document.getElementById('new-user-id').value.trim()
        const name = document.getElementById('new-user-name').value.trim()
        const email = document.getElementById('new-user-email').value.trim()
        const password = document.getElementById('new-user-password').value
        const role = document.getElementById('new-user-role').value
        
        if (!userId || !name || !email || !password || !role) {
            alert('Всі поля обов\'язкові')
            return
        }
        
        try {
            await call(API.createUser, {
                method: 'POST',
                headers: headersJSON(),
                body: JSON.stringify({ id: userId, name, email, password, role })
            })
            
            showNotification('Користувача успішно створено', 'success')
            
            // Очищаем форму
            createUserForm.reset()
            
            // Обновляем список пользователей
            await loadUsers()
            
        } catch (err) {
            console.error('Error creating user:', err)
            alert('Помилка при створенні користувача: ' + err.message)
        }
    })
}

// Показ повідомлення
function showNotification(message, type = 'info') {
    // Создаем элемент уведомления
    const notification = document.createElement('div')
    notification.className = `notification notification-${type}`
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `
    
    // Устанавливаем цвет в зависимости от типа
    switch (type) {
        case 'success':
            notification.style.backgroundColor = '#28a745'
            break
        case 'error':
            notification.style.backgroundColor = '#dc3545'
            break
        case 'warning':
            notification.style.backgroundColor = '#ffc107'
            notification.style.color = '#212529'
            break
        default:
            notification.style.backgroundColor = '#17a2b8'
    }
    
    notification.textContent = message
    
    // Добавляем в DOM
    document.body.appendChild(notification)
    
    // Автоматически удаляем через 5 секунд
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.animation = 'slideOut 0.3s ease'
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification)
                }
            }, 300)
        }
    }, 5000)
    
    // Добавляем CSS анимации
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style')
        style.id = 'notification-styles'
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `
        document.head.appendChild(style)
    }
}




