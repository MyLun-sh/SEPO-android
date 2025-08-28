// server.js
import express from 'express'
import bodyParser from 'body-parser'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import PDFDocument from 'pdfkit'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

import LOWDB from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = Number(process.env.PORT) || 3000

app.use(cors())
app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, 'public')))

// забезпечення папок
if (!fs.existsSync(path.join(__dirname, 'uploads')))
	fs.mkdirSync(path.join(__dirname, 'uploads'))
if (!fs.existsSync(path.join(__dirname, 'certs')))
	fs.mkdirSync(path.join(__dirname, 'certs'))

// lowdb
const adapter = new FileSync('db.json')
const db = LOWDB(adapter)

// Ініціалізація бази даних з значеннями за замовчуванням якщо порожня
db.defaults({
	users: [
		{
			id: 'u-admin',
			name: 'Адміністратор',
			email: 'admin@example.com',
			password: 'password',
			role: 'admin',
			createdAt: '2024-01-01T00:00:00.000Z'
		},
		{
			id: 'u-operator',
			name: 'Оператор',
			email: 'operator@example.com',
			password: 'password',
			role: 'operator',
			createdAt: '2024-01-01T00:00:00.000Z'
		},
		{
			id: 'u-applicant',
			name: 'Заявник',
			email: 'applicant@example.com',
			password: 'password',
			role: 'applicant',
			createdAt: '2024-01-01T00:00:00.000Z'
		},
		{
			id: 'u-inspector',
			name: 'Інспектор',
			email: 'inspector@example.com',
			password: 'password',
			role: 'inspector',
			createdAt: '2024-01-01T00:00:00.000Z'
		}
	],
	tokens: [],
	applications: [],
	files: [],
	tests: [],
	certificates: [],
	inspections: [],
	inspectionReports: [],
	logs: []
}).write()

// Міграція: додавання поля createdAt до існуючих користувачів якщо відсутнє
const existingUsers = db.get('users').value()
existingUsers.forEach(user => {
	if (!user.createdAt) {
		db.get('users').find({ id: user.id }).assign({ 
			createdAt: '2024-01-01T00:00:00.000Z' 
		}).write()
	}
})

// допоміжні функції
function nowISO() {
	return new Date().toISOString()
}

function isValidYMD(dateStr) {
	if (typeof dateStr !== 'string') return false
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false
	const parts = dateStr.split('-').map(n => Number(n))
	const year = parts[0]
	const month = parts[1]
	const day = parts[2]
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
	if (month < 1 || month > 12) return false
	if (day < 1 || day > 31) return false
	return true
}

function log(userId, role, action, fromState, toState, targetId = '', note = '') {
	db.get('logs')
		.push({
			id: uuidv4(),
			userId,
			role,
			action,
			fromState,
			toState,
			targetId,
			note,
			timestamp: nowISO(),
		})
		.write()
}

function getUserByToken(token) {
	const t = db.get('tokens').find({ token }).value()
	if (!t) return null
	return db.get('users').find({ id: t.userId }).value()
}

// middleware авторизації
function authMiddleware(req, res, next) {
	const auth = req.headers.authorization
	if (!auth) return res.status(401).json({ error: 'Відсутній заголовок авторизації' })
	
	const token = auth.replace('Bearer ', '')
	const user = getUserByToken(token)
	
	if (!user) return res.status(401).json({ error: 'Недійсний токен' })
	
	req.user = user
	next()
}

function roleCheck(roles) {
	return (req, res, next) => {
		if (!req.user) return res.status(401).json({ error: 'Unauthorized' })
		
		if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
			return res.status(403).json({ error: 'Заборонено' })
		}
		
		next()
	}
}

// multer
const storage = multer.diskStorage({
	destination: (_req, _file, cb) => cb(null, path.join(__dirname, 'uploads')),
	filename: (_req, file, cb) =>
		cb(null, `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`),
})

const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (_req, file, cb) => {
		const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/webp']
		if (allowed.includes(file.mimetype)) cb(null, true)
		else cb(new Error('Only pdf, jpg, jpeg, webp allowed'))
	},
})

// стани FSM та переходи згідно з алгоритмом
const STATES = [
	'draft',                    // Чернетка
	'submitted_docs',           // Документи подані
	'doc_analysis',             // Аналіз документації
	'doc_corrections',          // Усунення недоліків
	'pre_tests_decision',       // Прийняття рішення за заявкою
	'sampling_and_tests',       // Відбирання зразків та їх ідентифікація
	'certification_tests',      // Випробування з метою сертифікації
	'test_protocols',           // Видача протоколів випробувань
	'tests_analysis',           // Аналіз результатів сертифікаційних робіт
	'nonconformities',          // Усунення невідповідностей
	'approved',                 // Схвалено
	'certificate_generated',    // Видача сертифіката відповідності
	'contract_signed',          // Укладання сертифікаційного договору
	'registered',               // Реєстрація в Реєстрі Системи УкрСЕПРО
	'awaiting_inspection',      // Очікування інспекції
	'inspection_planned',       // Інспектування сертифікованої продукції (заплановано)
	'inspection_completed',     // Інспектування сертифікованої продукції (проведено)
	'inspection_denied',        // Інспекцію відхилено
	'closed',                   // Закрито
]

// Визначаємо рекомендовані строки сертифікатів згідно з алгоритмом
function getRecommendedValidity(productType, testKeys = []) {
	if (productType === 'одиничний') return 1
	if (productType === 'партія') return 2
	if (productType === 'серійна') {
		if (testKeys.includes('management_system')) return 5
		if (testKeys.includes('production_attestation')) return 3
		return 3 // за замовчуванням
	}
	return 1
}

// побудова дозволених дій для UI згідно з алгоритмом
function getAllowedActionsFor(application, user) {
	const state = application.state
	const allowed = []

	// Заявник може тільки завантажувати документи та виправляти недоліки
    if (user.role === 'applicant' && application.applicantId === user.id) {
		if (state === 'draft') {
			allowed.push({ action: 'submit_docs', label: 'Надіслати документацію' })
		}
		// submit_fix_docs видалено - буде оброблятися вручну в UI
		if (state === 'nonconformities') {
			allowed.push({ action: 'submit_fix_nonconformities', label: 'Відправити усунення невідповідностей' })
		}
		// Підписання договору тільки для партійної та серійної продукції на етапі contract_signed
        if (state === 'contract_signed' && ['партія', 'серійна'].includes(application.productType)) {
            const operatorSigned = application.meta && application.meta.operatorSignedAt
            const applicantSigned = application.contractSignedAt
            if (operatorSigned && !applicantSigned) {
                allowed.push({ action: 'sign_contract', label: 'Підписати договір' })
            }
        }
	}

	// Оператор та адмін можуть аналізувати та приймати рішення
    if (['operator', 'admin'].includes(user.role)) {
		if (state === 'submitted_docs') {
			allowed.push({ action: 'view_docs', label: 'Переглянути документацію' })
			allowed.push({ action: 'analyze_docs', label: 'Оцінити документацію' })
		}
		if (state === 'doc_analysis') {
			allowed.push({ action: 'view_docs', label: 'Переглянути документацію' })
			allowed.push({ action: 'analyze_docs', label: 'Змінити оцінку' })
		}
		if (state === 'pre_tests_decision') {
			if (application.productType === 'одиничний') {
				allowed.push({ action: 'decision_certification_tests', label: 'Випробування з метою сертифікації' })
			} else {
				if (application.productType === 'серійна') {
					const hasPreEval = !!(application.meta && application.meta.serialPreEval && application.meta.serialPreEval.chosenValidityYears)
					if (hasPreEval) {
						allowed.push({ action: 'serial_pre_evaluation_edit', label: 'Змінити оцінку серійної продукції' })
						allowed.push({ action: 'decision_sampling', label: 'Відбирання зразків та ідентифікація' })
					} else {
						// Для серійної продукції потрібна попередня оцінка
						allowed.push({ action: 'serial_pre_evaluation', label: 'Попередня оцінка серійної продукції' })
					}
				} else {
					// Партія — дозволяємо одразу
					allowed.push({ action: 'decision_sampling', label: 'Відбирання зразків та ідентифікація' })
				}
			}
		}
        if (state === 'sampling_and_tests') {
            // Для партії/серійної: введення даних відбору зразків
            const hasData = !!application.samplingData
            allowed.push({ action: 'input_sampling_data', label: hasData ? 'Змінити дані відбору зразків' : 'Ввести дані відбору зразків' })
            if (hasData) {
                allowed.push({ action: 'continue_to_tests', label: 'Перейти до сертифікаційних випробувань' })
            }
        }
		if (state === 'certification_tests') {
			// На цьому етапі лише запуск випробувань
			allowed.push({ action: 'run_certification_tests', label: 'Провести випробування' })
		}
        if (state === 'test_protocols') {
            // Після проведення випробувань можна ввести дані та видати протоколи
            const hasData = !!application.certificationData
            allowed.push({ action: 'input_certification_data', label: hasData ? 'Змінити дані сертифікаційних випробувань' : 'Ввести дані сертифікаційних випробувань' })
            allowed.push({ action: 'issue_protocols', label: 'Видати протоколи випробувань' })
        }
		if (state === 'tests_analysis') {
			allowed.push({ action: 'analyze_results', label: 'Аналізувати результати' })
		}
		if (state === 'approved') {
			allowed.push({ action: 'generate_certificate', label: 'Згенерувати сертифікат' })
		}
		// Запит повторної інспекції для оператора
		if (user.role === 'operator') {
			const needReinspect = (state === 'inspection_denied') || (state === 'inspection_completed' && typeof application.inspectionFinalText === 'string' && /відкликано/i.test(application.inspectionFinalText))
			if (needReinspect) {
				allowed.push({ action: 'request_reinspection', label: 'Запросити повторну інспекцію' })
			}
		}
		
		// Кнопка "Виправити помилки у виробництві" для оператора після інспекції
		if (user.role === 'operator' && state === 'inspection_completed') {
			allowed.push({ action: 'fix_production_errors', label: 'Виправити помилки у виробництві' })
		}
        // Для одиничних виробів: одразу до реєстрації після генерації сертифіката
        // Для партійної/серійної продукції: до етапу підписання договору
        if (state === 'certificate_generated') {
            // Одиничний виріб: одразу реєстрація; партія/серійна: укладання договору
            if (application.productType === 'одиничний') {
                allowed.push({ action: 'register', label: 'Зареєструвати в реєстрі' })
            } else {
                allowed.push({ action: 'continue_process', label: 'Перейти до укладання договору' })
            }
        }
        // Етап підписання договору - різні кнопки для різних ролей
        if (state === 'contract_signed') {
            const operatorSigned = application.meta && application.meta.operatorSignedAt
            const applicantSigned = application.contractSignedAt
            
            if (user.role === 'applicant') {
                // Заявник може підписати тільки після підпису оператором
                if (operatorSigned && !applicantSigned) {
                    allowed.push({ action: 'sign_contract', label: 'Підписати договір' })
                }
            } else if (['operator', 'admin'].includes(user.role)) {
                // Оператор/адмін може підписати першим
                if (!operatorSigned) {
                    allowed.push({ action: 'operator_sign_contract', label: 'Підписати договір (оператор)' })
                }
            }
            
            // Реєстрація доступна лише після підпису обома сторонами
            if (operatorSigned && applicantSigned) {
                allowed.push({ action: 'register', label: 'Зареєструвати в реєстрі' })
            }
        }
	}

	// Інспектор може планувати та проводити інспекції
	if (['inspector', 'admin'].includes(user.role)) {
		if (state === 'awaiting_inspection' && application.productType === 'серійна') {
			const wasCancelled = application.meta && application.meta.inspectionCancelledAt
			const reinspectionRequested = application.meta && application.meta.reinspectionRequestedAt
			// Після скасування інспекції приховуємо кнопки, поки оператор не запитає повторну інспекцію
			if (!wasCancelled || reinspectionRequested) {
				allowed.push({ action: 'conduct_inspection_now', label: 'Провести інспекцію' })
			}
		} else if (state === 'inspection_planned') {
			allowed.push({ action: 'complete_inspection', label: 'Завершити інспекцію' })
			allowed.push({ action: 'cancel_inspection', label: 'Скасувати інспекцію' })
		}
	}

	// Адмін може примусово змінювати стани
	if (user.role === 'admin') {
		allowed.push({ action: 'admin_force', label: 'Примусово змінити стан' })
	}

	return allowed
}

// утиліта створення заявки
function createApplication(ownerId, body) {
	return {
		id: uuidv4(),
		productName: body && body.productName ? body.productName : 'Без назви',
		productType: body && body.productType ? body.productType : 'одиничний',
		applicantType: body && body.applicantType ? body.applicantType : 'виробник',
		applicantId: ownerId,
		operatorId: null, // Додаємо поле для оператора
		state: 'draft',
		docs: [],
		tests: [],
		certificateId: null,
		createdAt: nowISO(),
		updatedAt: nowISO(),
		meta: {},
		rejectionReason: '', // Причина відхилення
		// Нові поля для ручного введення даних
		samplingData: null, // Дані відбору зразків
		certificationData: null, // Дані сертифікаційних випробувань
	}
}

// АВТОРИЗАЦІЯ
app.post('/api/login', (req, res) => {
	const { email, password } = req.body
	const user = db.get('users').find({ email, password }).value()
	if (!user) return res.status(401).json({ error: 'Недійсні облікові дані' })
	
	// Оновлюємо час останнього входу
	db.get('users').find({ id: user.id }).assign({ lastLogin: nowISO() }).write()
	
	const token = uuidv4()
	db.get('tokens').push({ token, userId: user.id, createdAt: nowISO() }).write()
	log(user.id, user.role, 'login', '', '', user.id, '')
	res.json({
		token,
		user: { id: user.id, name: user.name, role: user.role, email: user.email },
	})
})

app.post('/api/logout', authMiddleware, (req, res) => {
	const token = req.headers.authorization.replace('Bearer ', '')
	db.get('tokens').remove({ token }).write()
	log(req.user.id, req.user.role, 'logout', '', '', req.user.id, '')
	res.json({ ok: true })
})

app.get('/api/me', authMiddleware, (req, res) => {
	res.json({ user: req.user })
})

// CRUD заявок
app.post('/api/applications', authMiddleware, roleCheck(['applicant']), (req, res) => {
	const appObj = createApplication(req.user.id, req.body || {})
	db.get('applications').push(appObj).write()
	log(req.user.id, req.user.role, 'create_application', '', 'draft', appObj.id, '')
	res.json({ application: appObj })
})

app.get('/api/applications', authMiddleware, (req, res) => {
	const role = req.user.role
	const scope = req.query.scope || 'my' // 'my' або 'all'
	let list = db.get('applications').value()
	
	// Фільтрація згідно з ролями та scope
	if (scope === 'my') {
		// "Мої заявки" - кожен бачить тільки свої релевантні заявки
		if (role === 'applicant') {
			list = list.filter(a => a.applicantId === req.user.id)
		} else if (role === 'inspector') {
			// Інспектор бачить тільки заявки з інспекціями де він призначений
			const inspections = db.get('inspections').filter({ responsibleUserId: req.user.id }).value() || []
			const myAppIds = new Set(inspections.map(i => i.applicationId))
			list = list.filter(a => myAppIds.has(a.id))
		} else if (role === 'operator') {
			// Оператор бачить тільки заявки де він призначений як оператор
			list = list.filter(a => a.operatorId === req.user.id)
		} else if (role === 'admin') {
			// Адмін бачить тільки заявки які він створив
			list = list.filter(a => a.applicantId === req.user.id)
		}
	} else if (scope === 'all') {
		// "Всі заявки" - для ролей з доступом до цього виду
		if (role === 'applicant') {
			// Заявник не має доступу до "всіх заявок"
			return res.status(403).json({ error: 'Доступ заборонено' })
		} else if (role === 'inspector') {
			// Інспектор бачить всі заявки
			list = list // залишаємо всі заявки
		} else if (role === 'operator') {
			// Оператор бачить всі заявки (включаючи ті що в submitted_docs для аналізу)
			list = list // залишаємо всі заявки
		} else if (role === 'admin') {
			// Адмін бачить всі заявки
			list = list // залишаємо всі заявки
		}
	}
	res.json({ applications: list })
})

app.get('/api/applications/:id', authMiddleware, (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'Заявку не знайдено' })
	
	// Перевірка доступу
	if (req.user.role === 'applicant' && a.applicantId !== req.user.id)
		return res.status(403).json({ error: 'Forbidden' })
	
	// Документи з таблиці files, прив'язані до заявки
	const filesFromDocs = db.get('files').filter(f => Array.isArray(a.docs) && a.docs.includes(f.id)).value()
	const existingIds = new Set(filesFromDocs.map(f => f.id))

	// Додатково включаємо докази інспекції з application.inspectionEvidence (для сумісності з іншим завантаженням)
	const evidenceFromApp = Array.isArray(a.inspectionEvidence) ? a.inspectionEvidence.map(e => {
		const base = e && e.path ? path.basename(e.path) : ''
		const webPath = base ? `/uploads/${base}` : (e && typeof e.path === 'string' && e.path.startsWith('/uploads/') ? e.path : '')
		return {
			id: e.id || uuidv4(),
			originalName: e.originalName || base || 'evidence',
			filename: base,
			mimeType: e.mimeType || '',
			size: e.size || 0,
			uploaderId: e.uploadedBy || e.uploaderId || 'inspector',
			uploadedAt: e.uploadedAt || nowISO(),
			path: webPath,
			context: 'inspection_evidence',
		}
	}) : []

	const combinedFiles = filesFromDocs.slice()
	evidenceFromApp.forEach(f => { if (f && f.id && !existingIds.has(f.id)) combinedFiles.push(f) })
	
	const tests = db.get('tests').filter({ applicationId: a.id }).value()
	const cert = db.get('certificates').find({ applicationId: a.id }).value()
	const allowedActions = getAllowedActionsFor(a, req.user)
	
	res.json({ application: a, files: combinedFiles, tests, certificate: cert, allowedActions })
})

// видалення заявки - заявник може видаляти свої, оператор/адмін - будь-які
app.delete('/api/applications/:id', authMiddleware, (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'Application not found' })
	
	// Дозволено: заявник видаляє свою; оператор/адмін — будь-які. Інші ролі — заборонено
	const isApplicantOwn = req.user.role === 'applicant' && a.applicantId === req.user.id
	const isOperatorOrAdmin = ['operator', 'admin'].includes(req.user.role)
	if (!isApplicantOwn && !isOperatorOrAdmin) {
		return res.status(403).json({ error: 'Forbidden' })
	}
	
	// Видаляємо пов'язані дані
	db.get('files').remove(f => a.docs.includes(f.id)).write()
	db.get('tests').remove({ applicationId: a.id }).write()
	db.get('certificates').remove({ applicationId: a.id }).write()
	db.get('inspections').remove({ applicationId: a.id }).write()
	
	// Видаляємо саму заявку
	db.get('applications').remove({ id: a.id }).write()
	
	log(req.user.id, req.user.role, 'delete_application', a.state, '', a.id, '')
	res.json({ ok: true })
})

// завантаження - заявник, оператор або адмін можуть завантажувати документи
app.post('/api/applications/:id/upload', authMiddleware, upload.single('file'), (req, res) => {
	try {
		const a = db.get('applications').find({ id: req.params.id }).value()
		if (!a) return res.status(404).json({ error: 'Application not found' })
		
        // Дозволяємо: заявник (тільки у draft або doc_corrections), оператор, адмін
		const isApplicantOwn = req.user.role === 'applicant' && a.applicantId === req.user.id
		const isOperatorOrAdmin = ['operator', 'admin'].includes(req.user.role)
        const applicantAllowedState = a.state === 'draft' || a.state === 'doc_corrections'
        const operatorAllowedState = ['sampling_and_tests', 'test_protocols'].includes(a.state)
        if (!(isApplicantOwn && applicantAllowedState) && !(isOperatorOrAdmin && (applicantAllowedState || operatorAllowedState))) {
			return res.status(403).json({ error: 'Forbidden' })
		}
		
		// Визначаємо контекст файлу залежно від стану заявки
		let fileContext = 'Загальна документація'
		if (a.state === 'sampling_and_tests') {
			fileContext = 'Дані відбору зразків та їх ідентифікації'
		} else if (a.state === 'test_protocols') {
			fileContext = 'Дані сертифікаційних випробувань'
		} else if (a.state === 'draft' || a.state === 'doc_corrections') {
			fileContext = 'Початкова документація'
		}
		
		const fileRec = {
			id: uuidv4(),
			originalName: req.file.originalname,
			filename: req.file.filename,
			mimeType: req.file.mimetype,
			size: req.file.size,
			uploaderId: req.user.id,
			uploadedAt: nowISO(),
			path: `/uploads/${req.file.filename}`,
			context: fileContext, // Додаємо контекст файлу
		}
		
		db.get('files').push(fileRec).write()
		db.get('applications').find({ id: a.id }).get('docs').push(fileRec.id).write()
		db.get('applications').find({ id: a.id }).assign({ updatedAt: nowISO() }).write()
		
		log(req.user.id, req.user.role, 'upload_file', a.state, a.state, a.id, fileRec.originalName)
		res.json({ file: fileRec })
	} catch (err) {
		res.status(400).json({ error: err.message })
	}

// завантаження файлів доказів для інспекції (з обмеженням розміру)
const evidenceUpload = multer({
	storage,
	limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB per file
	fileFilter: (_req, file, cb) => {
		const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/webp', 'image/png', 'video/mp4', 'video/avi', 'video/mov']
		if (allowed.includes(file.mimetype)) cb(null, true)
		else cb(new Error('Only pdf, jpg, jpeg, webp, png, mp4, avi, mov allowed'))
	},
})

app.post('/api/applications/:id/upload-evidence', authMiddleware, evidenceUpload.array('files', 10), (req, res) => {
	try {
		const a = db.get('applications').find({ id: req.params.id }).value()
		if (!a) return res.status(404).json({ error: 'Application not found' })
		
		// Тільки інспектор може завантажувати докази
		if (req.user.role !== 'inspector') {
			return res.status(403).json({ error: 'Тільки інспектор може завантажувати докази' })
		}
		
		// Дозволяємо завантаження файлів під час запланованої інспекції, очікування інспекції, заявки на інспекцію або зареєстрованої заявки
		log(req.user.id, req.user.role, 'check_upload_state', a.state, a.state, a.id, `Checking upload state: ${a.state}`)
		if (a.state !== 'inspection_planned' && a.state !== 'awaiting_inspection' && a.state !== 'registered') {
			log(req.user.id, req.user.role, 'upload_state_failed', a.state, a.state, a.id, `Upload not allowed in state: ${a.state}`)
			return res.status(400).json({ error: 'Докази можна завантажувати тільки під час запланованої інспекції, очікування інспекції або зареєстрованої заявки' })
		}
		log(req.user.id, req.user.role, 'upload_state_passed', a.state, a.state, a.id, `Upload allowed in state: ${a.state}`)
		
		const files = req.files
		if (!files || files.length === 0) return res.status(400).json({ error: 'немає файлів' })
		
		// Перевіряємо загальний розмір файлів (не більше 300 MB)
		let totalSize = 0
		for (const file of files) {
			totalSize += file.size
		}
		
		if (totalSize > 300 * 1024 * 1024) {
			return res.status(400).json({ error: 'Загальний розмір файлів не може перевищувати 300 MB' })
		}
		
		const fileRecords = []
		
		for (const file of files) {
			const fileRecord = {
				id: uuidv4(),
				applicationId: a.id,
				originalName: file.originalname,
				path: `/uploads/${file.filename}`,
				size: file.size,
				uploaderId: req.user.id,
				uploaderRole: req.user.role,
				context: 'inspection_evidence',
				uploadedAt: nowISO()
			}
			
			db.get('files').push(fileRecord).write()
			fileRecords.push(fileRecord)

					// Також прив'яжемо файл як документ заявки (як у заявника),
		// щоб він відразу відображався у блоці "Документи" в UI
			const appDocs = Array.isArray(a.docs) ? a.docs.slice() : []
			appDocs.push(fileRecord.id)
			db.get('applications').find({ id: a.id }).assign({ docs: appDocs }).write()
		}
		
		// Відображення списку доказів у заявці для миттєвого відображення в UI
		const currentEvidence = Array.isArray(a.inspectionEvidence) ? a.inspectionEvidence : []
		const evidenceToStore = fileRecords.map(fr => ({
			id: fr.id,
			originalName: fr.originalName,
			path: fr.path,
			size: fr.size,
			uploadedBy: fr.uploaderId,
			uploadedAt: fr.uploadedAt,
		}))
		db.get('applications').find({ id: a.id }).assign({
			inspectionEvidence: [...currentEvidence, ...evidenceToStore],
			updatedAt: nowISO(),
		}).write()
		
		log(req.user.id, req.user.role, 'upload_evidence', a.state, a.state, a.id, `${files.length} files`)
		res.json({ ok: true, files: fileRecords })
	} catch (err) {
		res.status(400).json({ error: err.message })
	}

// Підпис інспекції
app.post('/api/applications/:id/sign-inspection', authMiddleware, (req, res) => {
	try {
		const a = db.get('applications').find({ id: req.params.id }).value()
		if (!a) return res.status(404).json({ error: 'Application not found' })
		
		const { signedBy } = req.body
		if (!signedBy || !['inspector', 'applicant'].includes(signedBy)) {
			return res.status(400).json({ error: 'Недійсний параметр signedBy' })
		}
		
		// Перевіряємо права на підпис
		if (signedBy === 'inspector' && req.user.role !== 'inspector') {
			return res.status(403).json({ error: 'Тільки інспектор може підписуватися як інспектор' })
		}
		
		if (signedBy === 'applicant' && (req.user.role !== 'applicant' || a.applicantId !== req.user.id)) {
			return res.status(403).json({ error: 'Тільки заявник може підписуватися як заявник' })
		}
		
		// Перевіряємо стан заявки
		if (a.state !== 'inspection_completed') {
			return res.status(400).json({ error: 'Можна підписувати тільки завершену інспекцію' })
		}
		
		// Перевіряємо послідовність підписів
		if (signedBy === 'applicant' && !a.inspectionSignedByInspector) {
			return res.status(400).json({ error: 'Спочатку повинен підписати інспектор' })
		}
		
		// Зберігаємо підпис
		const updateData = {}
		if (signedBy === 'inspector') {
			updateData.inspectionSignedByInspector = nowISO()
		} else if (signedBy === 'applicant') {
			updateData.inspectionSignedByApplicant = nowISO()
		}
		
		db.get('applications').find({ id: a.id }).assign(updateData).write()
		
		log(req.user.id, req.user.role, 'sign_inspection', a.state, a.state, a.id, `signed by ${signedBy}`)
		res.json({ ok: true })
		
	} catch (err) {
		res.status(400).json({ error: err.message })
	}
})
})
})

// подача документів - тільки заявник
app.post('/api/applications/:id/submit-docs', authMiddleware, roleCheck(['applicant']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'Не знайдено' })
	if (a.applicantId !== req.user.id) return res.status(403).json({ error: 'Заборонено' })
	if (a.state !== 'draft' && a.state !== 'doc_corrections')
		return res.status(400).json({ error: 'Можна подавати тільки з чернетки або виправлень документації' })
	if (!a.docs || a.docs.length === 0)
		return res.status(400).json({ error: 'Потрібен хоча б один документ' })
	
	const prev = a.state
	db.get('applications').find({ id: a.id }).assign({ state: 'submitted_docs', updatedAt: nowISO() }).write()
	
	log(req.user.id, req.user.role, 'submit_docs', prev, 'submitted_docs', a.id, '')
	res.json({ ok: true, next: 'submitted_docs' })
})

// аналіз документів - тільки оператор/адмін
app.post('/api/applications/:id/analyze-docs', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const { score, rejectionReason } = req.body
	const sc = typeof score === 'number' ? Math.max(0, Math.min(100, score)) : null
	if (sc === null) return res.status(400).json({ error: 'Потрібна оцінка (0-100)' })
	
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'Не знайдено' })
	if (!['submitted_docs', 'doc_corrections', 'doc_analysis'].includes(a.state))
		return res.status(400).json({ error: 'Недійсний стан для аналізу документації' })

	// Зберігаємо результат аналізу
	const existing = db.get('tests').find({ applicationId: a.id, key: 'doc_analysis' }).value()
	if (existing) {
		db.get('tests').find({ id: existing.id }).assign({
			value: sc,
			result: sc >= 70 ? 'pass' : 'fail',
			updatedAt: nowISO(),
		}).write()
	} else {
		db.get('tests').push({
			id: uuidv4(),
			applicationId: a.id,
			key: 'doc_analysis',
			name: 'Аналіз документації',
			value: sc,
			result: sc >= 70 ? 'pass' : 'fail',
			createdAt: nowISO(),
		}).write()
	}

	const prev = a.state
	if (sc >= 70) {
		db.get('applications').find({ id: a.id }).assign({ 
			state: 'pre_tests_decision', 
			operatorId: req.user.id,
			rejectionReason: '', // Очищаємо причину відхилення при успішній оцінці
			updatedAt: nowISO() 
		}).write()
		log(req.user.id, req.user.role, 'analyze_docs_pass', prev, 'pre_tests_decision', a.id, `score ${sc}`)
		return res.json({ ok: true, next: 'pre_tests_decision' })
	} else {
		db.get('applications').find({ id: a.id }).assign({ 
			state: 'doc_corrections', 
			rejectionReason: rejectionReason || 'Негативна оцінка документації',
			updatedAt: nowISO() 
		}).write()
		log(req.user.id, req.user.role, 'analyze_docs_fail', prev, 'doc_corrections', a.id, `score ${sc}`)
		return res.json({ ok: true, next: 'doc_corrections' })
	}
})

// рішення перед випробуваннями - тільки оператор/адмін
app.post('/api/applications/:id/pre-tests-decision', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const { decision } = req.body
	if (!decision || !['certification_tests', 'sampling'].includes(decision))
		return res.status(400).json({ error: 'Потрібне рішення' })
	
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'не знайдено' })
	if (a.state !== 'pre_tests_decision') return res.status(400).json({ error: 'Недійсний стан' })

    // Для серійної продукції не дозволяти перехід, якщо не збережено попередню оцінку
    if (a.productType === 'серійна' && decision === 'sampling') {
        const ok = a.meta && a.meta.serialPreEval && a.meta.serialPreEval.chosenValidityYears
        if (!ok) return res.status(400).json({ error: 'Спочатку збережіть "Оцінку для серійної продукції"' })
        
        // Перевіряємо, що оцінка не негативна
        if (a.meta.serialPreEval.chosenValidityYears === 0) {
            return res.status(400).json({ error: 'Оцінка серійної продукції негативна. Дочекайтеся виправленої партії серійної продукції та оцініть її заново.' })
        }
    }
	
	const prev = a.state
	if (decision === 'certification_tests') {
		// Для одиничного виробу - одразу до сертифікаційних випробувань
		db.get('applications').find({ id: a.id }).assign({ state: 'certification_tests', updatedAt: nowISO() }).write()
		log(req.user.id, req.user.role, 'decision_certification_tests', prev, 'certification_tests', a.id, '')
		return res.json({ ok: true, next: 'certification_tests' })
	} else {
		// Для партії/серійної - до відбору зразків
		db.get('applications').find({ id: a.id }).assign({ state: 'sampling_and_tests', updatedAt: nowISO() }).write()
		log(req.user.id, req.user.role, 'decision_sampling', prev, 'sampling_and_tests', a.id, '')
		return res.json({ ok: true, next: 'sampling_and_tests' })
	}
})

// Збереження попередньої оцінки для серійної продукції на етапі "Прийняття рішення за заявкою"
app.post('/api/applications/:id/serial-pre-eval', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
    const a = db.get('applications').find({ id: req.params.id }).value()
    if (!a) return res.status(404).json({ error: 'not found' })
    	if (a.state !== 'pre_tests_decision') return res.status(400).json({ error: 'Дозволено тільки на етапі pre_tests_decision' })
    	if (a.productType !== 'серійна') return res.status(400).json({ error: 'Тільки для серійної продукції' })

    const {
        docOnlyScore,            // Аналіз документації (без аудиту виробництва)
        productionAuditScore,    // Проведення аудиту виробництва
        productionAttScore,      // Проведення атестації виробництва
        managementSystemScore,   // Сертифікація (оцінка) системи управління
        chosenValidityYears,
    } = req.body || {}

    // Валідація балів (0..100)
    function normScore(v) {
        const n = Number(v)
        if (Number.isNaN(n)) return null
        return Math.max(0, Math.min(100, Math.round(n)))
    }
    const s1 = normScore(docOnlyScore)
    const s2 = normScore(productionAuditScore)
    const s3 = normScore(productionAttScore)
    const s4 = normScore(managementSystemScore)
    if ([s1, s2, s3, s4].some(v => v === null)) {
        		return res.status(400).json({ error: 'Всі оцінки мають бути числами від 0 до 100' })
    }

    // Обчислюємо дозволені строки сертифіката виходячи з >=70
    const allowedYears = []
    if (s1 >= 70) allowedYears.push(1)
    if (s2 >= 70) allowedYears.push(2)
    if (s3 >= 70) allowedYears.push(3)
    if (s4 >= 70) allowedYears.push(5)
    
    // Проверяем, все ли оценки меньше 70
    const allBelow70 = s1 < 70 && s2 < 70 && s3 < 70 && s4 < 70
    
    if (allBelow70) {
        // Если все оценки меньше 70, разрешаем только "не відповідає" (0)
        allowedYears.push(0)
    }

    const years = Number(chosenValidityYears)
    if (!allowedYears.includes(years)) {
        		return res.status(400).json({ error: 'Обраний строк сертифіката не відповідає наданим оцінкам. Перевірте, що всі оцінки >= 70 для обраного строку.' })
    }

    const meta = a.meta || {}
    meta.serialPreEval = {
        docOnlyScore: s1,
        productionAuditScore: s2,
        productionAttScore: s3,
        managementSystemScore: s4,
        allowedYears,
        chosenValidityYears: years,
        savedAt: nowISO(),
        savedBy: req.user.id,
    }

    db.get('applications').find({ id: a.id }).assign({ meta, updatedAt: nowISO() }).write()

    log(req.user.id, req.user.role, 'serial_pre_eval_saved', 'pre_tests_decision', 'pre_tests_decision', a.id, `years ${years}; scores ${s1}/${s2}/${s3}/${s4}`)
    res.json({ ok: true, allowedYears, chosenValidityYears: years })
})

// Планування інспекції з перевіркою на первинну інспекцію
app.post('/api/inspections', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    try {
        const { applicationId, date, responsibleUserId, responsibleName, notes, type, orderSigned } = req.body || {}
        
        if (!applicationId || !date || !responsibleName || !type) {
            return res.status(400).json({ error: 'Відсутні обов\'язкові поля' })
        }
        if (!isValidYMD(date)) {
            return res.status(400).json({ error: 'Дата має бути у форматі YYYY-MM-DD і бути коректною (місяць <= 12, день <= 31)' })
        }
        
        // Проверяем существование заявки
        const application = db.get('applications').find({ id: applicationId }).value()
        if (!application) {
            return res.status(404).json({ error: 'Application not found' })
        }
        

        
        // Оновлення або створення запланованої інспекції для цієї заявки
        const { inspection, created } = upsertPlannedInspection(application, {
            date,
            responsibleUserId,
            responsibleName,
            notes,
            type,
            orderSigned,
        }, req.user)

        // Проставляем стан заявки
        db.get('applications').find({ id: applicationId }).assign({ state: 'inspection_planned', updatedAt: nowISO(), inspectionSignedByInspector: null, inspectionSignedByApplicant: null }).write()

        log(req.user.id, req.user.role, created ? 'create_inspection' : 'update_inspection', '', 'заплановано', applicationId, `Тип: ${inspection.type}`)
        res.json({ success: true, inspection })
    } catch (err) {
        console.error('Error creating inspection:', err)
        res.status(500).json({ error: err.message })
    }
})

// Обновление запланированной инспекции
app.put('/api/inspections/:id', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    const { date, place, responsibleName, notes, type, orderSigned } = req.body || {}
    
    if (!date || !place || !responsibleName || !type) {
        return res.status(400).json({ error: 'Missing required fields' })
    }
    
    if (!isValidYMD(date)) {
        return res.status(400).json({ error: 'Дата має бути у форматі YYYY-MM-DD і бути коректною (місяць <= 12, день <= 31)' })
    }
    
    const inspection = db.get('inspections').find({ id: req.params.id }).value()
    if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' })
    }
    
    if (inspection.status !== 'заплановано') {
        		return res.status(400).json({ error: 'Можна редагувати тільки заплановані інспекції' })
    }
    

    
    // Обновляем все поля
    const updates = {
        date,
        place,
        responsibleName,
        notes: notes || '',
        type,
        orderSigned: orderSigned || false,
        updatedAt: nowISO()
    }
    
    db.get('inspections').find({ id: req.params.id }).assign(updates).write()
    
    // Видаляємо інші заплановані інспекції для тієї ж заявки, щоб не було дублікатів
    const appId = inspection.applicationId
    const others = db.get('inspections').filter(i => i.applicationId === appId && i.status === 'заплановано' && i.id !== req.params.id).value() || []
    if (others.length > 0) {
        others.forEach(o => db.get('inspections').remove({ id: o.id }).write())
    }
    
    log(req.user.id, req.user.role, 'edit_inspection', inspection.status, inspection.status, inspection.applicationId, `date: ${date}, place: ${place}`)
    
    res.json({ success: true, message: 'Inspection updated successfully' })
})

// Получение инспекции по ID
app.get('/api/inspections/:id', authMiddleware, (req, res) => {
    const inspection = db.get('inspections').find({ id: req.params.id }).value()
    if (!inspection) {
        return res.status(404).json({ error: 'Inspection not found' })
    }
    
    res.json({ inspection })
})

// проведення випробувань - тільки оператор/адмін
app.post('/api/applications/:id/run-tests', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'not found' })
	if (a.state !== 'sampling_and_tests') return res.status(400).json({ error: 'Invalid state' })
	
	// Генерируем тесты согласно типу продукции
	const testsDef = getTestsForProductType(a.productType)
	const created = []
	
	testsDef.forEach(def => {
		const val = Math.floor(50 + Math.random() * 50) // 50-100
		const rec = {
			id: uuidv4(),
			applicationId: a.id,
			key: def.key,
			name: def.name,
			value: val,
			result: val >= 70 ? 'pass' : 'fail',
			createdAt: nowISO(),
		}
		db.get('tests').push(rec).write()
		created.push(rec)
	})
	
	const prev = a.state
	db.get('applications').find({ id: a.id }).assign({ state: 'certification_tests', updatedAt: nowISO() }).write()
	
	log(req.user.id, req.user.role, 'run_tests', prev, 'certification_tests', a.id, `created ${created.length}`)
	res.json({ ok: true, created, next: 'certification_tests' })
})

// проведення сертифікаційних випробувань - тільки оператор/адмін
app.post('/api/applications/:id/run-certification-tests', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'not found' })
	if (a.state !== 'certification_tests') return res.status(400).json({ error: 'Invalid state' })
	
	// Проводим сертификационные испытания
	const prev = a.state
	db.get('applications').find({ id: a.id }).assign({ state: 'test_protocols', updatedAt: nowISO() }).write()
	
	log(req.user.id, req.user.role, 'run_certification_tests', prev, 'test_protocols', a.id, '')
	res.json({ ok: true, next: 'test_protocols' })
})

// видача протоколів - тільки оператор/адмін
app.post('/api/applications/:id/issue-protocols', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'not found' })
	if (a.state !== 'test_protocols') return res.status(400).json({ error: 'Invalid state' })
	
	// Проверяем наличие данных сертификационных испытаний
	if (!a.certificationData) {
		return res.status(400).json({ error: 'Спочатку введіть дані сертифікаційних випробувань' })
	}
	
	// Выдаем протоколы испытаний
	const prev = a.state
	db.get('applications').find({ id: a.id }).assign({ state: 'tests_analysis', updatedAt: nowISO() }).write()
	
	log(req.user.id, req.user.role, 'issue_protocols', prev, 'tests_analysis', a.id, '')
	res.json({ ok: true, next: 'tests_analysis' })
})

// аналіз результатів - тільки оператор/адмін
app.post('/api/applications/:id/analyze-results', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
    const { rejectionReason } = req.body
    const a = db.get('applications').find({ id: req.params.id }).value()
    if (!a) return res.status(404).json({ error: 'not found' })
    if (a.state !== 'tests_analysis') return res.status(400).json({ error: 'Invalid state' })

    const allTests = db.get('tests').filter({ applicationId: a.id }).value()
    	if (!allTests || allTests.length === 0) return res.status(400).json({ error: 'Тести відсутні' })

    // Базовий бал по тестам
    let score = 0
    let totalWeight = 0
    allTests.forEach(t => {
        const weight = getTestWeight(t.key, a.productType)
        score += t.value * weight
        totalWeight += weight
    })
    let finalScore = totalWeight > 0 ? Math.round(score / totalWeight) : 0

    // Враховуємо ручні дані сертифікаційних випробувань
    const cd = a.certificationData || null
    let cdFail = false
    let cdPass = false
    if (cd) {
        const r = String(cd.result || '').toLowerCase().trim()
        const hasNot = /(не\s*відповідає(\s*стандарту)?|не\s*видповидае(\s*стандарту)?)/.test(r)
        const hasYes = /(відповідає|видповидае)/.test(r) && !hasNot
        const scoreNum = Number(cd.score || 0)
        finalScore = scoreNum || finalScore
        cdPass = hasYes && scoreNum >= 70
        cdFail = hasNot || scoreNum < 70 || !hasYes
    }

    const prev = a.state

    if ((cd && cdPass) || (!cd && finalScore >= 70)) {
        db.get('applications').find({ id: a.id }).assign({
            state: 'approved',
            analysisScore: finalScore,
            rejectionReason: '',
            updatedAt: nowISO(),
        }).write()
        log(req.user.id, req.user.role, 'analyze_results_pass', prev, 'approved', a.id, `score ${finalScore}`)
        return res.json({ ok: true, verdict: 'approved', score: finalScore, next: 'approved' })
    } else {
        // Повертаємося на етап "Випробування з метою сертифікації" для виправлення даних
        db.get('applications').find({ id: a.id }).assign({
            state: 'certification_tests',
            analysisScore: finalScore,
            rejectionReason: rejectionReason || 'Негативний результат випробувань',
            updatedAt: nowISO(),
        }).write()
        log(req.user.id, req.user.role, 'analyze_results_fail', prev, 'certification_tests', a.id, `score ${finalScore}`)
        return res.json({ ok: true, verdict: 'rejected', score: finalScore, next: 'certification_tests' })
    }
})

// подача виправлень - тільки заявник
app.post('/api/applications/:id/submit-fixes', authMiddleware, roleCheck(['applicant']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'not found' })
	if (a.applicantId !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
	
	const prev = a.state
	if (a.state === 'doc_corrections') {
		db.get('applications').find({ id: a.id }).assign({ state: 'submitted_docs', updatedAt: nowISO() }).write()
		log(req.user.id, req.user.role, 'submit_fixes', prev, 'submitted_docs', a.id, '')
		return res.json({ ok: true, next: 'submitted_docs' })
	} else if (a.state === 'nonconformities') {
		db.get('applications').find({ id: a.id }).assign({ state: 'certification_tests', updatedAt: nowISO() }).write()
		log(req.user.id, req.user.role, 'submit_fix_nonconformities', prev, 'certification_tests', a.id, '')
		return res.json({ ok: true, next: 'certification_tests' })
	} else {
		return res.status(400).json({ error: 'Недійсний стан для відправки виправлень' })
	}
})

// генерація сертифіката - тільки оператор/адмін
app.post('/api/applications/:id/generate-certificate', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const { validityYears } = req.body
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'not found' })
	if (!['approved', 'certificate_generated'].includes(a.state))
		return res.status(400).json({ error: 'Недійсний стан для генерації сертифіката' })
	
	// Проверяем наличие данных сертификационных испытаний
	if (!a.certificationData) {
		return res.status(400).json({ error: 'Спочатку введіть дані сертифікаційних випробувань' })
	}
	
    // Определяем срок действия согласно типу продукции и проведенным тестам
    const testKeys = db.get('tests').filter({ applicationId: a.id }).map('key').value()
    const recommendedYears = getRecommendedValidity(a.productType, testKeys)
    let finalYears = validityYears || recommendedYears
    // Якщо на етапі pre_tests_decision для серійної було збережено вибір — використовуємо його
    if (a.productType === 'серійна' && a.meta && a.meta.serialPreEval && a.meta.serialPreEval.chosenValidityYears) {
        finalYears = a.meta.serialPreEval.chosenValidityYears
    }
	
	const cert = generateCertificate(a.id, req.user.id, finalYears)
	db.get('applications').find({ id: a.id }).assign({
		state: 'certificate_generated',
		certificateId: cert.id,
		updatedAt: nowISO(),
	}).write()
	
	log(req.user.id, req.user.role, 'generate_certificate', a.state, 'certificate_generated', a.id, cert.number)
	res.json({ ok: true, certificate: cert })
})

// підписання договору - тільки заявник
app.post('/api/applications/:id/sign-contract', authMiddleware, roleCheck(['applicant']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'not found' })
	if (a.applicantId !== req.user.id) return res.status(403).json({ error: 'Forbidden' })
	
    // Журналюємо спробу замість консолі
    log(req.user.id, req.user.role, 'sign_contract_attempt', a.state, a.state, a.id, `operatorSigned:${(a.meta && a.meta.operatorSignedAt) ? 'yes' : 'no'} applicantSigned:${a.contractSignedAt ? 'yes' : 'no'}`)
	
	if (a.state !== 'contract_signed') return res.status(400).json({ error: 'Invalid state' })
	
	// Проверяем, что оператор уже подписал
	const operatorSigned = a.meta && a.meta.operatorSignedAt
	if (!operatorSigned) {
		return res.status(400).json({ error: 'Спочатку повинен підписати оператор' })
	}
	
	// Проверяем, что заявник еще не подписал
	if (a.contractSignedAt) {
		return res.status(400).json({ error: 'Договір вже підписаний заявником' })
	}
	
	// Заявник подписывает договор (не меняем состояние, только добавляем timestamp)
	db.get('applications').find({ id: a.id }).assign({
		contractSignedAt: nowISO(),
		updatedAt: nowISO(),
	}).write()
	
	log(req.user.id, req.user.role, 'sign_contract', 'contract_signed', 'contract_signed', a.id, '')
	res.json({ ok: true })
})

// оператор підтверджує підписання договору — оператор/адмін
app.post('/api/applications/:id/sign-contract-operator', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
    const a = db.get('applications').find({ id: req.params.id }).value()
    if (!a) return res.status(404).json({ error: 'not found' })
    
    // Журналюємо спробу замість консолі
    log(req.user.id, req.user.role, 'operator_sign_contract_attempt', a.state, a.state, a.id, `operatorSigned:${(a.meta && a.meta.operatorSignedAt) ? 'yes' : 'no'}`)
    
    if (a.state !== 'contract_signed') return res.status(400).json({ error: 'Invalid state' })

    const meta = a.meta || {}
    meta.operatorSignedAt = nowISO()
    db.get('applications').find({ id: a.id }).assign({ meta, updatedAt: nowISO() }).write()

    log(req.user.id, req.user.role, 'operator_sign_contract', 'contract_signed', 'contract_signed', a.id, '')
    res.json({ ok: true })
})

// продовження процесу після генерації сертифіката - оператор/адмін
app.post('/api/applications/:id/continue-process', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'not found' })
	
    // Журналюємо спробу замість консолі
    log(req.user.id, req.user.role, 'continue_process_attempt', a.state, a.state, a.id, `productType:${a.productType}`)
	
	if (a.state !== 'certificate_generated') return res.status(400).json({ error: 'Invalid state' })
	
    // Одиничний виріб не потребує договору — це захист на бэкенді
    if (a.productType === 'одиничний') {
        		return res.status(400).json({ error: 'Одиничний виріб не потребує підписання договору' })
    }

    // Переходимо лише до етапу підписання договору без автопідпису заявника
    db.get('applications').find({ id: a.id }).assign({
        state: 'contract_signed',
        updatedAt: nowISO(),
    }).write()
	
	log(req.user.id, req.user.role, 'continue_process', 'certificate_generated', 'contract_signed', a.id, '')
	res.json({ ok: true, next: 'contract_signed' })
})

// реєстрація - тільки оператор/адмін
app.post('/api/applications/:id/register', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'not found' })
	
    if (a.productType === 'одиничний') {
        // Для одиничного — реєстрація після генерації сертифіката (state може бути certificate_generated)
        if (a.state !== 'certificate_generated') {
            		return res.status(400).json({ error: 'Одиничний виріб може бути зареєстрований тільки після генерації сертифіката' })
        }
    } else {
        // Партія/серійна — реєстрація тільки після підписання договору обома сторонами
        if (a.state !== 'contract_signed') {
            		return res.status(400).json({ error: 'Реєстрація дозволена тільки після підписання договору' })
        }
        const operatorSigned = a.meta && a.meta.operatorSignedAt
        if (!a.contractSignedAt || !operatorSigned) {
            		return res.status(400).json({ error: 'І оператор, і заявник повинні підписати договір' })
        }
    }
	
	// Определяем следующее состояние в зависимости от типа продукции
	let nextState = 'closed'
	let nextStateName = 'Закрито'
	
    if (a.productType === 'серійна') {
		// Для серійна продукции нужна инспекция
		nextState = 'awaiting_inspection'
		nextStateName = 'Очікування інспекції'
	}
	
	db.get('applications').find({ id: a.id }).assign({
		state: nextState,
		registeredAt: nowISO(),
		updatedAt: nowISO(),
	}).write()
	
	log(req.user.id, req.user.role, 'register', a.state, nextState, a.id, '')

	// Якщо заявка не вимагає інспекції або перейшла у стан, де інспекція не актуальна — прибираємо заплановані інспекції
	if (nextState !== 'inspection_planned' && nextState !== 'awaiting_inspection') {
		removePlannedInspections(a.id)
	}

	res.json({ ok: true, next: nextState, nextStateName })
})

// планування інспекції - тільки інспектор/адмін
app.post('/api/applications/:id/plan-inspection', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    const { date, responsibleUserId, notes, type, orderSigned } = req.body || {}
    const a = db.get('applications').find({ id: req.params.id }).value()
    if (!a) return res.status(404).json({ error: 'not found' })
    
    if (date && !isValidYMD(date)) {
        return res.status(400).json({ error: 'Дата має бути у форматі YYYY-MM-DD і бути коректною (місяць <= 12, день <= 31)' })
    }
    
    // Проверяем, была ли уже первинна інспекція для этой заявки
    if (type === 'первинна') {
        const existingPrimaryInspection = db.get('inspections')
            .find({ applicationId: a.id, type: 'первинна' })
            .value()
        
        if (existingPrimaryInspection) {
            return res.status(400).json({ 
                error: 'Вже була первинна інспекція для цієї заявки, тому ви не можете вибрати первинну, виберіть інший тип інспекції' 
            })
        }
    }
    
    // Дозволяємо планування інспекції у будь-який момент (в т.ч. повторні/позапланові)
	
	const { inspection, created } = upsertPlannedInspection(a, {
		date: date || null,
		responsibleUserId,
		responsibleName: req.user.name || req.user.id,
		notes,
		type,
		orderSigned,
	}, req.user)
	db.get('applications').find({ id: a.id }).assign({ state: 'inspection_planned', inspectionSignedByInspector: null, inspectionSignedByApplicant: null, updatedAt: nowISO() }).write()
	log(req.user.id, req.user.role, created ? 'plan_inspection' : 'update_inspection', 'registered', 'inspection_planned', a.id, inspection.id)
	res.json({ ok: true, inspection })
})

// Відмова від інспекції інспектором
app.post('/api/inspections/:id/deny', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    const rec = db.get('inspections').find({ id: req.params.id }).value()
    if (!rec) return res.status(404).json({ error: 'Inspection not found' })

    db.get('inspections').find({ id: rec.id }).assign({
        status: 'відхилено',
        completedAt: nowISO(),
        notes: (req.body && req.body.notes) || rec.notes || '',
    }).write()

    const reason = (req.body && (req.body.reason || req.body.notes)) || ''
    db.get('applications').find({ id: rec.applicationId }).assign({
        state: 'inspection_denied',
        updatedAt: nowISO(),
        meta: {
            ...(db.get('applications').find({ id: rec.applicationId }).value().meta || {}),
            inspectionDenialReason: reason,
        }
    }).write()

    log(req.user.id, req.user.role, 'deny_inspection', 'inspection_planned', 'inspection_denied', rec.applicationId, rec.id)
    res.json({ ok: true })
})

// Приховати інспекцію у персональній історії інспектора (не видаляє запис)
app.post('/api/inspections/:id/hide-for/:userId', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    const rec = db.get('inspections').find({ id: req.params.id }).value()
    if (!rec) return res.status(404).json({ error: 'Inspection not found' })
    const userId = req.params.userId
    const hiddenFor = Array.isArray(rec.hiddenFor) ? rec.hiddenFor : []
    if (!hiddenFor.includes(userId)) hiddenFor.push(userId)
    db.get('inspections').find({ id: rec.id }).assign({ hiddenFor }).write()
    log(req.user.id, req.user.role, 'hide_inspection_for_user', 'n/a', 'n/a', rec.id, `user:${userId}`)
    res.json({ ok: true })
})

// Редактирование запланированной инспекции (дата и место)
app.put('/api/inspections/:id', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    const rec = db.get('inspections').find({ id: req.params.id }).value()
    if (!rec) return res.status(404).json({ error: 'Inspection not found' })
    
    const { date, place } = req.body || {}
    
    if (date && !isValidYMD(date)) {
        return res.status(400).json({ error: 'Дата має бути у форматі YYYY-MM-DD і бути коректною (місяць <= 12, день <= 31)' })
    }
    
    if (place !== undefined) {
        db.get('inspections').find({ id: rec.id }).assign({ place }).write()
    }
    
    log(req.user.id, req.user.role, 'edit_inspection', 'n/a', 'n/a', rec.id, `date:${date}, place:${place}`)
    res.json({ ok: true })
})

// Получение данных инспекции
app.get('/api/inspections/:id', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    const rec = db.get('inspections').find({ id: req.params.id }).value()
    if (!rec) return res.status(404).json({ error: 'Inspection not found' })
    
    res.json({ inspection: rec })
})

// скасування інспекції - тільки інспектор/адмін
app.post('/api/inspections/:id/cancel', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
	const rec = db.get('inspections').find({ id: req.params.id }).value()
	if (!rec) return res.status(404).json({ error: 'Inspection not found' })
	
	// Удаляем инспекцию
	db.get('inspections').remove({ id: rec.id }).write()
	
	// Проверяем, есть ли другие запланированные інспекції по цій заявці
	const others = db.get('inspections').filter({ applicationId: rec.applicationId }).value() || []
	const hasPlanned = others.some(i => i.status === 'заплановано')
	
	// Обновляем заявку відповідно до наявності інших планів
	const a = db.get('applications').find({ id: rec.applicationId }).value()
	const meta = a.meta || {}
	if (!hasPlanned) {
		meta.inspectionCancelledAt = nowISO()
		meta.inspectionCancelledBy = req.user.id
		// Повертаємо в очікування інспекції лише якщо інших планів немає
		db.get('applications').find({ id: rec.applicationId }).assign({ 
			state: 'awaiting_inspection', 
			inspectionSignedByInspector: null,
			inspectionSignedByApplicant: null,
			meta,
			updatedAt: nowISO() 
		}).write()
		log(req.user.id, req.user.role, 'cancel_inspection', 'inspection_planned', 'awaiting_inspection', rec.applicationId, rec.id)
	} else {
		// Якщо інші плани є — лишаємо стан заплановано і не ставимо позначку скасування для заявки
		db.get('applications').find({ id: rec.applicationId }).assign({ 
			state: 'inspection_planned', 
			updatedAt: nowISO() 
		}).write()
		log(req.user.id, req.user.role, 'cancel_inspection', 'inspection_planned', 'inspection_planned', rec.applicationId, rec.id)
	}

	// При скасуванні — також прибираємо інші заплановані інспекції для цієї заявки, щоб не висіли у списку
	removePlannedInspections(rec.applicationId)
	
	res.json({ ok: true })
})

// завершення інспекції - тільки інспектор/адмін
app.post('/api/inspections/:id/complete', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
	const rec = db.get('inspections').find({ id: req.params.id }).value()
	if (!rec) return res.status(404).json({ error: 'Inspection not found' })
	
    const { result, notes, prodOk, qualityOk, testsOk } = req.body || {}
	
	db.get('inspections').find({ id: rec.id }).assign({
		status: 'проведено',
		completedAt: nowISO(),
        result: result || 'відповідає',
        notes: notes || '',
        checklist: {
            prodOk: prodOk === 1 || prodOk === '1' || prodOk === true,
            qualityOk: qualityOk === 1 || qualityOk === '1' || qualityOk === true,
            testsOk: testsOk === 1 || testsOk === '1' || testsOk === true,
        },
		reportFileId: req.body.reportFileId || null,
	}).write()
	
    // Висновок за результатами чекліста
    const revoke = !( (prodOk === 1 || prodOk === '1' || prodOk === true) && (qualityOk === 1 || qualityOk === '1' || qualityOk === true) && (testsOk === 1 || testsOk === '1' || testsOk === true) )
    const appBefore = db.get('applications').find({ id: rec.applicationId }).value() || {}
    const clearedMeta = { ...(appBefore.meta || {}) }
    delete clearedMeta.inspectionCancelledAt
    delete clearedMeta.inspectionCancelledBy
    delete clearedMeta.inspectionDenialReason

    const appUpdate = {
        state: 'inspection_completed',
        inspectionResult: result || 'відповідає',
        updatedAt: nowISO(),
        inspectionConclusion: revoke ? 'Акт інспекційного контролю: рішення про відзив сертифіката' : 'Акт інспекційного контролю: сертифікат збережено',
        inspectionFinalText: revoke ? 'Результат інспекції: Сертифікат відкликано' : 'Результат інспекції: Сертифікат підтверджено',
        meta: clearedMeta,
    }
    db.get('applications').find({ id: rec.applicationId }).assign(appUpdate).write()

    // Після завершення інспекції — прибираємо заплановані інспекції для цієї заявки
    const planned = db.get('inspections').filter({ applicationId: rec.applicationId, status: 'заплановано' }).value() || []
    if (planned.length > 0) {
        planned.forEach(p => db.get('inspections').remove({ id: p.id }).write())
    }
	
	log(req.user.id, req.user.role, 'complete_inspection', 'inspection_planned', 'inspection_completed', rec.applicationId, rec.id)

	// Після завершення — прибираємо всі інші заплановані інспекції для цієї заявки
	removePlannedInspections(rec.applicationId)

	res.json({ ok: true })
})

// примусове керування адміном - тільки адмін
app.post('/api/admin/force-state', authMiddleware, roleCheck(['admin']), (req, res) => {
	const { applicationId, toState, reason } = req.body || {}
	if (!applicationId || !toState) return res.status(400).json({ error: 'Потрібні applicationId та toState' })
	if (!STATES.includes(toState)) return res.status(400).json({ error: 'Невідомий стан' })
	
	const a = db.get('applications').find({ id: applicationId }).value()
	if (!a) return res.status(404).json({ error: 'Application not found' })
	
	const prev = a.state
	db.get('applications').find({ id: a.id }).assign({
		state: toState,
		updatedAt: nowISO(),
		meta: {
			...a.meta,
			adminForcedAt: nowISO(),
			adminForcedBy: req.user.id,
		},
	}).write()
	
	log(req.user.id, req.user.role, 'admin_force', prev, toState, a.id, reason || '')
	res.json({ ok: true, from: prev, to: toState })
})

// API endpoints для ручного введення даних
app.post('/api/applications/:id/sampling-data', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const { 
		code, batchNumber, samplingPlace, samplingDate, quantity, inspectorName, 
		serialNumber, storageConditions, sampleCode
	} = req.body
	
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'Application not found' })
	if (a.state !== 'sampling_and_tests') return res.status(400).json({ error: 'Неправильний стан' })
	
	// Проверяем обязательные поля
	const requiredFields = ['code', 'serialNumber', 'quantity', 'storageConditions', 'sampleCode', 'samplingDate', 'samplingPlace', 'inspectorName']
	const missingFields = requiredFields.filter(field => !req.body[field] || req.body[field].trim() === '')
	
	if (missingFields.length > 0) {
		return res.status(400).json({ 
			error: `Відсутні обов'язкові поля: ${missingFields.join(', ')}` 
		})
	}
	
	// Обновляем данные отбора образцов
	db.get('applications').find({ id: a.id }).assign({
		samplingData: {
			code: code || '',
			batchNumber: batchNumber || '',
			samplingPlace: samplingPlace || '',
			samplingDate: samplingDate || '',
			quantity: quantity || '',
			inspectorName: inspectorName || '',
			serialNumber: serialNumber || '',
			storageConditions: storageConditions || '',
			sampleCode: sampleCode || '',
			completedAt: nowISO(),
		},
		updatedAt: nowISO(),
	}).write()
	
	log(req.user.id, req.user.role, 'sampling_data_completed', 'sampling_and_tests', 'sampling_and_tests', a.id, `Sample code: ${sampleCode}`)
	res.json({ ok: true })
})

app.post('/api/applications/:id/continue-to-tests', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'Application not found' })
	if (a.state !== 'sampling_and_tests') return res.status(400).json({ error: 'Неправильний стан' })
	if (!a.samplingData) return res.status(400).json({ error: 'Потрібні дані відбору зразків' })
	
	// Переходим к сертификационным испытаниям
	db.get('applications').find({ id: a.id }).assign({
		state: 'certification_tests',
		updatedAt: nowISO(),
	}).write()
	
	log(req.user.id, req.user.role, 'continue_to_tests', 'sampling_and_tests', 'certification_tests', a.id, '')
	res.json({ ok: true, next: 'certification_tests' })
})

app.post('/api/applications/:id/certification-data', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
	const { protocolNumber, conductDate, organization, testMethod, result, score } = req.body
	const a = db.get('applications').find({ id: req.params.id }).value()
	if (!a) return res.status(404).json({ error: 'Application not found' })
	if (a.state !== 'test_protocols') return res.status(400).json({ error: 'Неправильний стан' })
	
	// Обновляем данные сертификационных испытаний
	db.get('applications').find({ id: a.id }).assign({
		certificationData: {
			protocolNumber: protocolNumber || '',
			conductDate: conductDate || '',
			organization: organization || '',
			testMethod: testMethod || '',
			result: result || 'відповідає',
			score: score || 0,
			completedAt: nowISO(),
		},
		updatedAt: nowISO(),
	}).write()
	
	log(req.user.id, req.user.role, 'certification_data_completed', 'test_protocols', 'test_protocols', a.id, `score: ${score}`)
	res.json({ ok: true })
})

// Запит повторної інспекції (від оператора)
app.post('/api/applications/:id/request-reinspection', authMiddleware, roleCheck(['operator', 'admin']), (req, res) => {
    const a = db.get('applications').find({ id: req.params.id }).value()
    if (!a) return res.status(404).json({ error: 'Application not found' })
    
    // Проверяем, что заявка в состоянии отказа в инспекции или завершенной инспекции
    if (a.state !== 'inspection_denied' && a.state !== 'inspection_completed') {
        return res.status(400).json({ error: 'Заявка не в стані для повторної інспекції' })
    }
    
    // Позначаємо у метаданих запит
    const meta = a.meta || {}
    meta.reinspectionRequestedAt = nowISO()
    meta.reinspectionRequestedBy = req.user.id
    
    // Переводим заявку обратно в состояние ожидания инспекции
    const newState = 'awaiting_inspection'
    
    db.get('applications').find({ id: a.id }).assign({ 
        state: newState,
        inspectionSignedByInspector: null,
        inspectionSignedByApplicant: null,
        meta, 
        updatedAt: nowISO() 
    }).write()
    
    log(req.user.id, req.user.role, 'request_reinspection', a.state, newState, a.id, '')
    res.json({ ok: true })
})

// Відмова в інспекції (від інспектора)
app.post('/api/applications/:id/deny-inspection', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    try {
        const { reason } = req.body
        if (!reason || reason.trim() === '') {
            return res.status(400).json({ error: 'Причина відмови обов\'язкова' })
        }
        
        const a = db.get('applications').find({ id: req.params.id }).value()
        if (!a) return res.status(404).json({ error: 'Application not found' })
        
        // Проверяем, что заявка в состоянии ожидания инспекции
        if (a.state !== 'awaiting_inspection') {
            return res.status(400).json({ error: 'Заявка не в стані очікування інспекції' })
        }
        
        // Сохраняем причину отказа и переводим в состояние "отказано в инспекции"
        const meta = a.meta || {}
        meta.inspectionDeniedAt = nowISO()
        meta.inspectionDeniedBy = req.user.id
        meta.inspectionDenialReason = reason.trim()
        
        db.get('applications').find({ id: a.id }).assign({
            state: 'inspection_denied',
            meta,
            updatedAt: nowISO()
        }).write()
        
        log(req.user.id, req.user.role, 'deny_inspection', 'awaiting_inspection', 'inspection_denied', a.id, reason.trim())
        // При відмові — також прибираємо всі заплановані інспекції для цієї заявки
        removePlannedInspections(a.id)
        res.json({ ok: true })
        
    } catch (err) {
        console.error('Error denying inspection:', err)
        res.status(500).json({ error: err.message })
    }
})

// Перенесення інспекції (від інспектора)
app.post('/api/applications/:id/reschedule-inspection', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    try {
        const { newDate } = req.body
        if (!newDate || newDate.trim() === '') {
            return res.status(400).json({ error: 'Нова дата обов\'язкова' })
        }
        if (!isValidYMD(newDate.trim())) {
            return res.status(400).json({ error: 'Неможливо перенести. Вкажіть дату у форматі YYYY-MM-DD (місяць <= 12, день <= 31)' })
        }
        
        const a = db.get('applications').find({ id: req.params.id }).value()
        if (!a) return res.status(404).json({ error: 'Application not found' })
        
        // Проверяем, что заявка в состоянии ожидания инспекции
        if (a.state !== 'awaiting_inspection') {
            return res.status(400).json({ error: 'Заявка не в стані очікування інспекції' })
        }
        
        // Сохраняем информацию о переносе
        const meta = a.meta || {}
        meta.inspectionRescheduledAt = nowISO()
        meta.inspectionRescheduledBy = req.user.id
        meta.inspectionRescheduledTo = newDate.trim()
        
        // Создаем новую запланированную инспекцию
        const inspection = {
            id: uuidv4(),
            applicationId: a.id,
            date: newDate.trim(),
            responsibleUserId: req.user.id,
            responsibleName: req.user.name || req.user.id,
            notes: 'Інспекцію перенесено',
            type: 'перенесена',
            orderSigned: false,
            status: 'заплановано',
            createdAt: nowISO()
        }
        
        db.get('inspections').push(inspection).write()

        // Після проведення інспекції одразу — видаляємо всі заплановані інспекції для цієї заявки
        const plannedForApp = db.get('inspections').filter({ applicationId: a.id, status: 'заплановано' }).value() || []
        if (plannedForApp.length > 0) {
            plannedForApp.forEach(p => db.get('inspections').remove({ id: p.id }).write())
        }
        
        // Обновляем заявку
        db.get('applications').find({ id: a.id }).assign({
            state: 'inspection_planned',
            inspectionSignedByInspector: null,
            inspectionSignedByApplicant: null,
            meta,
            updatedAt: nowISO()
        }).write()
        
        log(req.user.id, req.user.role, 'reschedule_inspection', 'awaiting_inspection', 'inspection_planned', a.id, `Нова дата: ${newDate}`)
        res.json({ ok: true, inspection })
        
    } catch (err) {
        console.error('Error rescheduling inspection:', err)
        res.status(500).json({ error: err.message })
    }
})

// Проведення інспекції зараз (від інспектора)
app.post('/api/applications/:id/conduct-inspection', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    try {
        const { prodOk, qualityOk, testsOk } = req.body
        
        const a = db.get('applications').find({ id: req.params.id }).value()
        if (!a) return res.status(404).json({ error: 'Application not found' })
        
        // Проверяем, что заявка в состоянии ожидания инспекции
        if (a.state !== 'awaiting_inspection') {
            return res.status(400).json({ error: 'Заявка не в стані очікування інспекції' })
        }
        
        // Создаем инспекцию и сразу завершаем ее
        const inspection = {
            id: uuidv4(),
            applicationId: a.id,
            date: new Date().toISOString().split('T')[0],
            responsibleUserId: req.user.id,
            responsibleName: req.user.name || req.user.id,
            notes: 'Інспекцію проведено одразу',
            type: 'позапланова',
            orderSigned: false,
            status: 'завершено',
            createdAt: nowISO(),
            completedAt: nowISO(),
            result: {
                prodOk: prodOk === 1 || prodOk === '1' || prodOk === true,
                qualityOk: qualityOk === 1 || qualityOk === '1' || qualityOk === true,
                testsOk: testsOk === 1 || testsOk === '1' || testsOk === true,
            }
        }
        
        db.get('inspections').push(inspection).write()
        
        // Определяем результат инспекции
        const allOk = (prodOk === 1 || prodOk === '1' || prodOk === true) && 
                     (qualityOk === 1 || qualityOk === '1' || qualityOk === true) && 
                     (testsOk === 1 || testsOk === '1' || testsOk === true)
        
        // Очищаем позначку про скасування, якщо інспекцію успішно проведено
        const clearedMeta = { ...(a.meta || {}) }
        delete clearedMeta.inspectionCancelledAt
        delete clearedMeta.inspectionCancelledBy
        delete clearedMeta.inspectionDenialReason
        
        // Обновляем заявку
        const appUpdate = {
            state: 'inspection_completed',
            inspectionResult: allOk ? 'відповідає' : 'не відповідає',
            updatedAt: nowISO(),
            inspectionConclusion: allOk ? 'Акт інспекційного контролю: сертифікат збережено' : 'Акт інспекційного контролю: рішення про відзив сертифіката',
            inspectionFinalText: allOk ? 'Результат інспекції: Сертифікат підтверджено' : 'Результат інспекції: Сертифікат відкликано',
            meta: clearedMeta,
        }
        
        db.get('applications').find({ id: a.id }).assign(appUpdate).write()
        
        log(req.user.id, req.user.role, 'conduct_inspection', 'awaiting_inspection', 'inspection_completed', a.id, `Результат: ${allOk ? 'підтверджено' : 'відкликано'}`)
        // Після проведення — прибираємо усі заплановані інспекції цієї заявки
        removePlannedInspections(a.id)
        res.json({ ok: true, inspection })
        
    } catch (err) {
        console.error('Error conducting inspection:', err)
        res.status(500).json({ error: err.message })
    }
})



// API endpoints
app.get('/api/inspections', authMiddleware, (req, res) => {
	try {
		const status = req.query.status
		let inspections = db.get('inspections').value() || []
		let applications = []
		
		// Фильтрация согласно ролям
		if (req.user.role === 'inspector') {
			inspections = inspections.filter(i => i.responsibleUserId === req.user.id)
		} else if (req.user.role === 'applicant') {
			// Заявник видит только инспекции своих заявок
			const myApps = db.get('applications').filter({ applicantId: req.user.id }).value() || []
			const myAppIds = new Set(myApps.map(a => a.id))
			inspections = inspections.filter(i => myAppIds.has(i.applicationId))
		}
		
		// Если запрошены заявки на инспекцию
		if (status === 'pending') {
			// Заявки, що очікують інспекцію (серійна продукція)
			// Приховуємо заявки, де інспекцію вже провели, скасували або відмовили
			applications = db.get('applications')
				.filter(a => {
					const isAwaitOrReg = (a.state === 'awaiting_inspection' || a.state === 'registered')
					const isSerial = a.productType === 'серійна'
					if (!(isAwaitOrReg && isSerial)) return false
					
					// Перевіряємо мета-дані заявки
					const meta = a.meta || {}
					const wasCancelled = !!meta.inspectionCancelledAt
					const reinspectionRequested = !!meta.reinspectionRequestedAt
					
					// Якщо інспекцію скасовано і не запитували повторну — не показуємо
					if (wasCancelled && !reinspectionRequested) return false
					
					// Перевіряємо чи немає вже завершених, скасованих або відмовлених інспекцій для цієї заявки
					const existingInspections = db.get('inspections').filter({ applicationId: a.id }).value() || []
					const hasCompletedInspection = existingInspections.some(i => 
						i.status === 'завершено' || i.status === 'відмовлено' || i.status === 'скасовано' || 
						i.status === 'відхилено' || i.status === 'проведено' || i.status === 'відмовлено'
					)
					
					// Якщо інспекцію вже провели, скасували або відмовили — не показуємо в pending
					if (hasCompletedInspection) return false
					
					// Додатково перевіряємо стан заявки - якщо вона вже завершена або скасована
					if (a.state === 'completed' || a.state === 'cancelled' || a.state === 'inspection_completed' || 
						a.state === 'closed' || a.state === 'inspection_denied') {
						return false
					}
					
					return true
				})
				.value() || []
			
			// Автоматично очищаємо устаревшие запланированные инспекции для отфильтрованных заявок
			applications.forEach(app => {
				if (app.state !== 'inspection_planned' && app.state !== 'awaiting_inspection') {
					removePlannedInspections(app.id)
				}
			})
			
			// Фильтруем по роли
			if (req.user.role === 'inspector') {
				// Інспектор бачить всі релевантні заявки
			} else if (req.user.role === 'admin') {
				// Адмін бачить всі заявки на інспекцію
			}
			
			res.json({ inspections: applications })
		} else {
			res.json({ inspections })
		}
	} catch (err) {
		console.error('Error in /api/inspections:', err)
		res.status(500).json({ error: err.message })
	}
})

app.get('/api/logs', authMiddleware, roleCheck(['operator', 'admin', 'inspector']), (req, res) => {
	res.json({ logs: db.get('logs').value() })
})

// Очистка журнала действий - только для оператора
app.post('/api/logs/clear', authMiddleware, roleCheck(['operator']), (req, res) => {
	try {
		const logs = db.get('logs').value()
		
		// Определяем критически важные действия, которые НЕЛЬЗЯ удалять
		const criticalActions = [
			'create_application',      // Создание заявок
			'generate_certificate',    // Генерация сертификатов
			'register',                // Регистрация в реестре
			'complete_inspection',     // Завершение инспекций
			'deny_inspection',         // Отклонение инспекций
			'admin_force'              // Принудительные изменения админом
		]
		
		// Удаляем все логи, кроме критически важных
		const logsToKeep = logs.filter(log => criticalActions.includes(log.action))
		const logsToDelete = logs.filter(log => !criticalActions.includes(log.action))
		
		// Очищаем журнал и оставляем только критически важные записи
		db.set('logs', logsToKeep).write()
		
		// Логируем саму операцию очистки
		db.get('logs').push({
			id: uuidv4(),
			userId: req.user.id,
			role: req.user.role,
			action: 'clear_logs',
			fromState: '',
			toState: '',
			targetId: '',
			note: `Очищено ${logsToDelete.length} записей журналу. Залишено ${logsToKeep.length} критично важних записей.`,
			timestamp: nowISO(),
		}).write()
		
		res.json({ 
			ok: true, 
			deleted: logsToDelete.length,
			kept: logsToKeep.length,
			message: `Журнал очищено. Видалено ${logsToDelete.length} записей, залишено ${logsToKeep.length} критично важних.`
		})
	} catch (error) {
		console.error('Error clearing logs:', error)
		res.status(500).json({ error: 'Помилка очищення журналу' })
	}
})

// допоміжна функція генерації сертифіката
function generateCertificate(applicationId, issuedByUserId, validityYears = 1) {
	const appObj = db.get('applications').find({ id: applicationId }).value()
	const issuedAt = new Date()
	const expiresAt = new Date(issuedAt.getTime())
	expiresAt.setFullYear(expiresAt.getFullYear() + validityYears)
	
	const number = `CERT-${Math.floor(100000 + Math.random() * 800000)}`
	const pdfPath = path.join(__dirname, 'certs', `${number}.pdf`)
	
	const doc = new PDFDocument({ size: 'A4', margin: 60 })
	doc.pipe(fs.createWriteStream(pdfPath))
	
	doc.fontSize(28).text('СЕРТИФІКАТ ВІДПОВІДНОСТІ', { align: 'center' })
	doc.moveDown(1)
	doc.fontSize(30).text(number, { align: 'center', underline: true })
	doc.moveDown(1)
	doc.fontSize(12).text(`Продукція: ${appObj.productName}`, { align: 'center' })
	doc.moveDown(0.4)
	
	const applicant = db.get('users').find({ id: appObj.applicantId }).value()
	doc.text(`Заявник: ${applicant ? applicant.name : 'N/A'}`, { align: 'center' })
	doc.moveDown(0.4)
	doc.text(`Дата видачі: ${issuedAt.toISOString().slice(0, 10)}`, { align: 'center' })
	doc.text(`Дійсний до: ${expiresAt.toISOString().slice(0, 10)} (${validityYears} р.)`, { align: 'center' })
	doc.moveDown(1)
	
	const issuer = db.get('users').find({ id: issuedByUserId }).value()
	doc.text(`Видав: ${issuer ? issuer.name : 'Operator'}`, { align: 'center' })
	doc.end()

	const certRec = {
		id: uuidv4(),
		applicationId,
		number,
		issuedById: issuedByUserId,
		issuedAt: issuedAt.toISOString(),
		expiresAt: expiresAt.toISOString(),
		pdfPath: `/certs/${number}.pdf`,
		validityYears,
	}
	
	db.get('certificates').push(certRec).write()
	return certRec
}

// Допоміжні функції для тестів
function getTestsForProductType(productType) {
	const baseTests = [
		{ key: 'doc_analysis', name: 'Аналіз документації', weight: 1 }
	]
	
	if (productType === 'одиничний') {
		return baseTests
	} else if (productType === 'партія') {
		return [
			...baseTests,
			{ key: 'production_audit', name: 'Аудит виробництва', weight: 1 }
		]
	} else if (productType === 'серійна') {
		return [
			...baseTests,
			{ key: 'production_attestation', name: 'Атестація виробництва', weight: 1 },
			{ key: 'management_system', name: 'Система управління', weight: 1 }
		]
	}
	
	return baseTests
}

function getTestWeight(testKey, productType) {
	const weights = {
		'doc_analysis': 1,
		'production_audit': 1,
		'production_attestation': 1,
		'management_system': 1
	}
	return weights[testKey] || 1
}

// Допоміжні функції для інспекцій щоб уникнути дублікатів
function findActivePlannedInspection(applicationId) {
    const list = db.get('inspections').filter({ applicationId }).value() || []
    const planned = list.filter(i => i.status === 'заплановано')
    if (planned.length === 0) return null
    planned.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    return planned[0]
}

function upsertPlannedInspection(application, params, user) {
    const existing = findActivePlannedInspection(application.id)
    const base = {
        applicationId: application.id,
        date: params.date || null,
        responsibleUserId: params.responsibleUserId || (user && user.id) || null,
        responsibleName: params.responsibleName || (user && (user.name || user.id)) || '',
        notes: params.notes || '',
        type: params.type || 'первинна',
        orderSigned: !!params.orderSigned,
        status: 'заплановано',
    }
    if (existing) {
        const updates = {
            ...base,
            updatedAt: nowISO(),
        }
        // Оновлюємо існуючу заплановану інспекцію та видаляємо можливі дублікати
        db.get('inspections').find({ id: existing.id }).assign(updates).write()
        const others = db.get('inspections').filter(i => i.applicationId === application.id && i.status === 'заплановано' && i.id !== existing.id).value() || []
        if (others.length > 0) {
            others.forEach(o => db.get('inspections').remove({ id: o.id }).write())
        }
        return { inspection: { ...existing, ...updates }, created: false }
    }
    const rec = {
        id: uuidv4(),
        ...base,
        createdAt: nowISO(),
    }
    db.get('inspections').push(rec).write()
    return { inspection: rec, created: true }
}

// Видалення всіх запланованих інспекцій для заявки
function removePlannedInspections(applicationId) {
    const planned = db.get('inspections').filter({ applicationId, status: 'заплановано' }).value() || []
    let removed = 0
    if (planned.length > 0) {
        planned.forEach(p => { db.get('inspections').remove({ id: p.id }).write(); removed++ })
    }
    
    // Додатково перевіряємо чи заявка ще потребує інспекції
    const application = db.get('applications').find({ id: applicationId }).value()
    if (application) {
        const needsInspection = application.state === 'inspection_planned' || application.state === 'awaiting_inspection'
        if (!needsInspection) {
            // Якщо заявка більше не потребує інспекції - прибираємо всі заплановані
            const allPlanned = db.get('inspections').filter({ applicationId, status: 'заплановано' }).value() || []
            allPlanned.forEach(p => { db.get('inspections').remove({ id: p.id }).write(); removed++ })
        }
    }
    
    return removed
}

// Endpoint очищення для видалення застарілих запланованих інспекцій для заявки
app.post('/api/applications/:id/cleanup-planned-inspections', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    try {
        const a = db.get('applications').find({ id: req.params.id }).value()
        if (!a) return res.status(404).json({ error: 'Application not found' })
        		// Тільки очищення коли заявка не в станах планування/очікування
        if (a.state === 'inspection_planned' || a.state === 'awaiting_inspection') {
            return res.json({ removed: 0 })
        }
        const removed = removePlannedInspections(a.id)
        res.json({ removed })
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

// статичні файли
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
app.use('/certs', express.static(path.join(__dirname, 'certs')))
app.use('/pictures', express.static(path.join(__dirname, 'pictures')))

// запуск сервера (єдиний виклик) і прив'язка до 0.0.0.0 для доступу ззовні
const server = app.listen(PORT, '0.0.0.0', () => console.log(`Server listening at http://0.0.0.0:${PORT}`))

server.on('error', err => {
	if (err.code === 'EADDRINUSE') {
		console.error(`Port ${PORT} is already in use. Start with another port: PORT=${PORT + 1} npm start`)
		process.exit(1)
	} else {
		console.error('Server error:', err)
		process.exit(1)
	}
})



// Отримання інспекції за ID
app.get('/api/inspections/:id', authMiddleware, (req, res) => {
	try {
		const inspection = db.get('inspections').find({ id: req.params.id }).value()
		if (!inspection) return res.status(404).json({ error: 'Inspection not found' })
		res.json({ inspection })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// Відхилення інспекції
app.post('/api/inspections/:id/deny', authMiddleware, roleCheck(['inspector']), (req, res) => {
	try {
		const { reason } = req.body
		if (!reason) return res.status(400).json({ error: 'Reason required' })
		
		const inspection = db.get('inspections').find({ id: req.params.id }).value()
		if (!inspection) return res.status(404).json({ error: 'Inspection not found' })
		
		// Обновляем статус инспекции
		db.get('inspections')
			.find({ id: req.params.id })
			.assign({ 
				status: 'відмовлено',
				deniedAt: nowISO(),
				deniedBy: req.user.id,
				denyReason: reason
			})
			.write()
		
		// Логируем действие
		log(req.user.id, req.user.role, 'deny_inspection', inspection.status, 'відмовлено', req.params.id, reason)

		// При відмові — видаляємо усі заплановані інспекції для відповідної заявки
		removePlannedInspections(inspection.applicationId)
		
		res.json({ success: true })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// Збереження звіту інспекції
app.post('/api/inspections/:id/report', authMiddleware, roleCheck(['inspector']), (req, res) => {
    try {
        const { location, participants, results, conclusion, inspectorSign, clientSign } = req.body
        
        if (!location || !participants || !results || !conclusion || !inspectorSign || !clientSign) {
            return res.status(400).json({ error: 'All fields required' })
        }
        
        const inspection = db.get('inspections').find({ id: req.params.id }).value()
        if (!inspection) return res.status(404).json({ error: 'Inspection not found' })
        
        // Создаем акт инспекционной проверки
        const report = {
            id: uuidv4(),
            inspectionId: req.params.id,
            location,
            participants,
            results,
            conclusion,
            inspectorSign,
            clientSign,
            createdAt: nowISO(),
            createdBy: req.user.id
        }
        
        // Сохраняем акт
        db.get('inspectionReports').push(report).write()
        
        // Обновляем статус инспекции
        const newStatus = conclusion === 'відповідає' ? 'завершено' : 'не відповідає'
        db.get('inspections')
            .find({ id: req.params.id })
            .assign({ 
                status: newStatus,
                completedAt: nowISO(),
                reportId: report.id
            })
            .write()
        
        // Обновляем заявку: результат інспекції та очищення відмітки про скасування
        const application = db.get('applications').find({ id: inspection.applicationId }).value()
        if (application) {
            const ok = conclusion === 'відповідає'
            const clearedMeta = { ...(application.meta || {}) }
            delete clearedMeta.inspectionCancelledAt
            delete clearedMeta.inspectionCancelledBy
            delete clearedMeta.inspectionDenialReason
            db.get('applications').find({ id: inspection.applicationId }).assign({
                state: 'inspection_completed',
                inspectionResult: conclusion,
                inspectionConclusion: ok ? 'Акт інспекційного контролю: сертифікат збережено' : 'Акт інспекційного контролю: рішення про відзив сертифіката',
                inspectionFinalText: ok ? 'Результат інспекції: Сертифікат підтверджено' : 'Результат інспекції: Сертифікат відкликано',
                meta: clearedMeta,
                updatedAt: nowISO(),
            }).write()
        }
        
        // Логируем действие
        log(req.user.id, req.user.role, 'complete_inspection', inspection.status, newStatus, req.params.id, `Заключення: ${conclusion}`)

        // Після збереження акту — прибираємо всі заплановані інспекції цієї заявки
        removePlannedInspections(inspection.applicationId)
        
        res.json({ success: true, report })
    } catch (err) {
        res.status(500).json({ error: err.message })
    }
})

// Створення нової інспекції
app.post('/api/inspections', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    try {
        const { applicationId, date, responsibleName, notes, type, orderSigned } = req.body
        
        if (!applicationId || !date || !responsibleName || !type) {
            return res.status(400).json({ error: 'Missing required fields' })
        }
        if (!isValidYMD(date)) {
            return res.status(400).json({ error: 'Дата має бути у форматі YYYY-MM-DD і бути коректною (місяць <= 12, день <= 31)' })
        }
        
        // Проверяем существование заявки
        const application = db.get('applications').find({ id: applicationId }).value()
        if (!application) {
            return res.status(404).json({ error: 'Application not found' })
        }
        
        const inspection = {
            id: uuidv4(),
            applicationId,
            date,
            responsibleUserId: req.user.id,
            responsibleName,
            notes: notes || '',
            type,
            orderSigned: orderSigned || false,
            status: 'заплановано',
            createdAt: nowISO()
        }
        
        db.get('inspections').push(inspection).write()
        
        // Логируем создание инспекции
        log(req.user.id, req.user.role, 'create_inspection', '', 'заплановано', applicationId, `Тип: ${type}`)
        
        res.json({ success: true, inspection })
    } catch (err) {
        console.error('Error creating inspection:', err)
        res.status(500).json({ error: err.message })
    }
})

// Загрузка фото- или видео-доказательств инспекции
app.post('/api/applications/:id/upload-evidence', authMiddleware, roleCheck(['inspector', 'admin']), upload.array('files', 10), (req, res) => {
    const applicationId = req.params.id
    const files = req.files
    
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' })
    }
    
    // Проверяем общий размер файлов (максимум 300 MB)
    let totalSize = 0
    for (let file of files) {
        totalSize += file.size
    }
    
    if (totalSize > 300 * 1024 * 1024) {
        return res.status(400).json({ error: 'Total file size exceeds 300 MB limit' })
    }
    
    // Получаем заявку
    const application = db.get('applications').find({ id: applicationId }).value()
    if (!application) {
        return res.status(404).json({ error: 'Application not found' })
    }
    
    // Разрешаем загрузку файлов во время запланированной инспекции, ожидания инспекции, заявки на инспекцию или зарегистрированной заявки
    log(req.user.id, req.user.role, 'check_upload_state', application.state, application.state, applicationId, `Checking upload state: ${application.state}`)
    if (application.state !== 'inspection_planned' && application.state !== 'awaiting_inspection' && application.state !== 'registered') {
        log(req.user.id, req.user.role, 'upload_state_failed', application.state, application.state, applicationId, `Upload not allowed in state: ${application.state}`)
        return res.status(400).json({ error: 'Can only upload evidence for planned inspections, pending inspections, or registered applications' })
    }
    log(req.user.id, req.user.role, 'upload_state_passed', application.state, application.state, applicationId, `Upload allowed in state: ${application.state}`)
    
    // Сохраняем файлы
    const evidenceFiles = files.map(file => ({
        id: uuidv4(),
        originalName: file.originalname,
        path: file.path,
        size: file.size,
        uploadedBy: req.user.id,
        uploadedAt: nowISO(),
        type: 'inspection_evidence'
    }))
    
    // Добавляем файлы к заявке
    const currentEvidence = application.inspectionEvidence || []
    const updatedEvidence = [...currentEvidence, ...evidenceFiles]
    
    db.get('applications').find({ id: applicationId }).assign({ 
        inspectionEvidence: updatedEvidence,
        updatedAt: nowISO() 
    }).write()
    
    log(req.user.id, req.user.role, 'upload_evidence', application.state, application.state, applicationId, `uploaded ${files.length} files`)
    
    res.json({ 
        ok: true, 
        files: evidenceFiles,
        message: `Uploaded ${files.length} files successfully` 
    })
})

// Удаление фото- или видео-доказательств инспекции
app.delete('/api/applications/:id/delete-evidence', authMiddleware, roleCheck(['inspector', 'admin']), (req, res) => {
    try {
        const applicationId = req.params.id
        const { fileIndex } = req.body
        
        if (fileIndex === undefined || fileIndex < 0) {
            return res.status(400).json({ error: 'Invalid file index' })
        }
        
        // Получаем заявку
        const application = db.get('applications').find({ id: applicationId }).value()
        if (!application) {
            return res.status(404).json({ error: 'Application not found' })
        }
        
        // Разрешаем удаление файлов во время запланированной инспекции, ожидания инспекции, заявки на инспекцию или зарегистрированной заявки
        if (application.state !== 'inspection_planned' && application.state !== 'awaiting_inspection' && application.state !== 'registered') {
            return res.status(400).json({ error: 'Can only delete evidence for planned inspections, pending inspections, or registered applications' })
        }
        
        // Проверяем наличие файлов
        if (!application.inspectionEvidence || !application.inspectionEvidence[fileIndex]) {
            return res.status(404).json({ error: 'File not found' })
        }
        
        // Удаляем файл из массива
        const fileToDelete = application.inspectionEvidence[fileIndex]
        application.inspectionEvidence.splice(fileIndex, 1)
        
        // Обновляем заявку
        db.get('applications').find({ id: applicationId }).assign({ 
            inspectionEvidence: application.inspectionEvidence,
            updatedAt: nowISO() 
        }).write()
        
        // Логируем удаление
        log(req.user.id, req.user.role, 'delete_evidence', application.state, application.state, applicationId, `deleted file: ${fileToDelete.originalName}`)
        
        res.json({ 
            ok: true, 
            message: 'File deleted successfully' 
        })
        
    } catch (err) {
        console.error('Error deleting evidence:', err)
        res.status(500).json({ error: err.message })
    }
})

// Подпись инспекции
app.post('/api/applications/:id/sign-inspection', authMiddleware, (req, res) => {
    const { signedBy } = req.body || {}
    
    if (!signedBy || !['inspector', 'applicant'].includes(signedBy)) {
        return res.status(400).json({ error: 'Invalid signedBy parameter' })
    }
    
    const application = db.get('applications').find({ id: req.params.id }).value()
    if (!application) {
        return res.status(404).json({ error: 'Application not found' })
    }
    
    if (application.state !== 'inspection_completed') {
        return res.status(400).json({ error: 'Can only sign completed inspections' })
    }
    
    // Проверяем права на подпись
    if (signedBy === 'inspector') {
        if (req.user.role !== 'inspector' && req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only inspectors can sign inspections' })
        }
        if (application.inspectionSignedByInspector) {
            return res.status(400).json({ error: 'Inspection already signed by inspector' })
        }
    } else if (signedBy === 'applicant') {
        if (req.user.role !== 'applicant') {
            return res.status(403).json({ error: 'Only applicants can sign inspections' })
        }
        if (application.applicantId !== req.user.id) {
            return res.status(403).json({ error: 'Can only sign own applications' })
        }
        if (!application.inspectionSignedByInspector) {
            return res.status(400).json({ error: 'Inspector must sign first' })
        }
        if (application.inspectionSignedByApplicant) {
            return res.status(400).json({ error: 'Inspection already signed by applicant' })
        }
    }
    
    // Обновляем подпись
    const updates = {}
    if (signedBy === 'inspector') {
        updates.inspectionSignedByInspector = nowISO()
    } else if (signedBy === 'applicant') {
        updates.inspectionSignedByApplicant = nowISO()
    }
    updates.updatedAt = nowISO()
    
    db.get('applications').find({ id: req.params.id }).assign(updates).write()
    
    log(req.user.id, req.user.role, 'sign_inspection', application.state, application.state, req.params.id, `signed by ${signedBy}`)
    
    	res.json({ ok: true, signedBy, signedAt: updates[signedBy === 'inspector' ? 'inspectionSignedByInspector' : 'inspectionSignedByApplicant'] })
})

// ===== API для управления пользователями (только для админа) =====

// Простий тестовий endpoint для перевірки
app.get('/api/test', (req, res) => {
	res.json({ message: 'Server is working!', timestamp: new Date().toISOString() })
})

// Получить всех пользователей
app.get('/api/users', authMiddleware, roleCheck(['admin']), (req, res) => {
	try {
		const users = db.get('users').value()
		
		// Включаем пароли и последний вход для админа
		const usersWithPasswords = users.map(user => ({
			id: user.id,
			name: user.name,
			email: user.email,
			password: user.password,
			role: user.role,
			createdAt: user.createdAt,
			lastLogin: user.lastLogin
		}))
		
		res.json({ users: usersWithPasswords })
	} catch (err) {
		console.error('Error getting users:', err)
		res.status(500).json({ error: err.message })
	}
})

// Создать нового пользователя
app.post('/api/users', authMiddleware, roleCheck(['admin']), (req, res) => {
	try {
		const { id, name, email, password, role } = req.body
		
		// Валидация
		if (!id || !name || !email || !password || !role) {
			return res.status(400).json({ error: 'Всі поля обов\'язкові: ID, ім\'я, email, пароль, роль' })
		}
		
		if (!['applicant', 'operator', 'inspector', 'admin'].includes(role)) {
			return res.status(400).json({ error: 'Недійсна роль. Дозволені: applicant, operator, inspector, admin' })
		}
		
		// Проверяем, что ID уникален
		const existingUserById = db.get('users').find({ id }).value()
		if (existingUserById) {
			return res.status(400).json({ error: 'Користувач з таким ID вже існує' })
		}
		
		// Проверяем, что email уникален
		const existingUserByEmail = db.get('users').find({ email }).value()
		if (existingUserByEmail) {
			return res.status(400).json({ error: 'Користувач з таким email вже існує' })
		}
		
		// Создаем пользователя
		const newUser = {
			id: id.trim(),
			name,
			email,
			password,
			role,
			createdAt: nowISO(),
			lastLogin: null
		}
		
		db.get('users').push(newUser).write()
		
		log(req.user.id, req.user.role, 'create_user', '', '', newUser.id, `role: ${role}`)
		
		res.json({ 
			ok: true, 
			user: {
				id: newUser.id,
				name: newUser.name,
				email: newUser.email,
				role: newUser.role,
				createdAt: newUser.createdAt
			}
		})
	} catch (err) {
		console.error('Error creating user:', err)
		res.status(500).json({ error: err.message })
	}
})

// Изменить пароль пользователя
app.put('/api/users/:id/password', authMiddleware, roleCheck(['admin']), (req, res) => {
	try {
		const { password } = req.body
		
		if (!password) {
			return res.status(400).json({ error: 'Пароль обов\'язковий' })
		}
		
		const user = db.get('users').find({ id: req.params.id }).value()
		if (!user) {
			return res.status(404).json({ error: 'Користувача не знайдено' })
		}
		
		// Обновляем пароль
		db.get('users').find({ id: req.params.id }).assign({ password }).write()
		
		log(req.user.id, req.user.role, 'change_user_password', '', '', req.params.id, '')
		
		res.json({ ok: true })
	} catch (err) {
		console.error('Error changing password:', err)
		res.status(500).json({ error: err.message })
	}
})

// Изменить имя пользователя
app.put('/api/users/:id/name', authMiddleware, roleCheck(['admin']), (req, res) => {
	try {
		const { name } = req.body
		
		if (!name || name.trim() === '') {
			return res.status(400).json({ error: 'Ім\'я обов\'язкове' })
		}
		
		const user = db.get('users').find({ id: req.params.id }).value()
		if (!user) {
			return res.status(404).json({ error: 'Користувача не знайдено' })
		}
		
		// Обновляем имя
		db.get('users').find({ id: req.params.id }).assign({ name: name.trim() }).write()
		
		log(req.user.id, req.user.role, 'change_user_name', '', '', req.params.id, `old: ${user.name}, new: ${name.trim()}`)
		
		res.json({ ok: true })
	} catch (err) {
		console.error('Error changing user name:', err)
		res.status(500).json({ error: err.message })
	}
})

// Изменить email пользователя
app.put('/api/users/:id/email', authMiddleware, roleCheck(['admin']), (req, res) => {
	try {
		const { email } = req.body
		
		if (!email || email.trim() === '') {
			return res.status(400).json({ error: 'Email обов\'язковий' })
		}
		
		// Проверяем, что email уникален
		const existingUser = db.get('users').find({ email: email.trim() }).value()
		if (existingUser && existingUser.id !== req.params.id) {
			return res.status(400).json({ error: 'Користувач з таким email вже існує' })
		}
		
		const user = db.get('users').find({ id: req.params.id }).value()
		if (!user) {
			return res.status(404).json({ error: 'Користувача не знайдено' })
		}
		
		// Обновляем email
		db.get('users').find({ id: req.params.id }).assign({ email: email.trim() }).write()
		
		log(req.user.id, req.user.role, 'change_user_email', '', '', req.params.id, `old: ${user.email}, new: ${email.trim()}`)
		
		res.json({ ok: true })
	} catch (err) {
		console.error('Error changing user email:', err)
		res.status(500).json({ error: err.message })
	}
})

// Изменить ID пользователя
app.put('/api/users/:id/id', authMiddleware, roleCheck(['admin']), (req, res) => {
	try {
		const { newId } = req.body
		
		if (!newId || newId.trim() === '') {
			return res.status(400).json({ error: 'Новий ID обов\'язковий' })
		}
		
		// Проверяем, что новый ID уникален
		const existingUser = db.get('users').find({ id: newId.trim() }).value()
		if (existingUser) {
			return res.status(400).json({ error: 'Користувач з таким ID вже існує' })
		}
		
		const user = db.get('users').find({ id: req.params.id }).value()
		if (!user) {
			return res.status(404).json({ error: 'Користувача не знайдено' })
		}
		
		// Нельзя изменить ID самого себя
		if (user.id === req.user.id) {
			return res.status(400).json({ error: 'Не можна змінити власний ID' })
		}
		
		// Обновляем ID пользователя
		db.get('users').find({ id: req.params.id }).assign({ id: newId.trim() }).write()
		
		// Обновляем все токены этого пользователя
		db.get('tokens').find({ userId: req.params.id }).assign({ userId: newId.trim() }).write()
		
		log(req.user.id, req.user.role, 'change_user_id', '', '', req.params.id, `old: ${req.params.id}, new: ${newId.trim()}`)
		
		res.json({ ok: true })
	} catch (err) {
		console.error('Error changing user ID:', err)
		res.status(500).json({ error: err.message })
	}
})

// Удалить пользователя
app.delete('/api/users/:id', authMiddleware, roleCheck(['admin']), (req, res) => {
	try {
		const user = db.get('users').find({ id: req.params.id }).value()
		if (!user) {
			return res.status(404).json({ error: 'Користувача не знайдено' })
		}
		
		// Нельзя удалить самого себя
		if (user.id === req.user.id) {
			return res.status(400).json({ error: 'Не можна видалити власний акаунт' })
		}
		
		// Удаляем пользователя
		db.get('users').remove({ id: req.params.id }).write()
		
		// Удаляем все токены этого пользователя
		db.get('tokens').remove({ userId: req.params.id }).write()
		
		log(req.user.id, req.user.role, 'delete_user', '', '', req.params.id, `deleted user: ${user.email}`)
		
		res.json({ ok: true })
	} catch (err) {
		console.error('Error deleting user:', err)
		res.status(500).json({ error: err.message })
	}
})

// Изменить роль пользователя
app.put('/api/users/:id/role', authMiddleware, roleCheck(['admin']), (req, res) => {
	try {
		const { role } = req.body
		
		if (!role || !['applicant', 'operator', 'inspector', 'admin'].includes(role)) {
			return res.status(400).json({ error: 'Недійсна роль. Дозволені: applicant, operator, inspector, admin' })
		}
		
		const user = db.get('users').find({ id: req.params.id }).value()
		if (!user) {
			return res.status(404).json({ error: 'Користувача не знайдено' })
		}
		
		// Нельзя изменить роль самого себя
		if (user.id === req.user.id) {
			return res.status(400).json({ error: 'Не можна змінити власну роль' })
		}
		
		// Обновляем роль
		db.get('users').find({ id: req.params.id }).assign({ role }).write()
		
		log(req.user.id, req.user.role, 'change_user_role', '', '', req.params.id, `new role: ${role}`)
		
		res.json({ ok: true })
	} catch (err) {
		console.error('Error changing user role:', err)
		res.status(500).json({ error: err.message })
	}
})

// SPA fallback - має бути в кінці, після всіх API endpoints
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))
