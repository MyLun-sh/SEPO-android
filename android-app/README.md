# SEPO Android Приложение

Это Android приложение для системы сертификации продукции УкрСЕПРО, созданное на основе веб-версии.

## Структура проекта

```
android-app/
├── app/
│   └── src/
│       └── main/
│           ├── assets/           # Веб-файлы приложения
│           │   ├── index.html
│           │   ├── styles.css
│           │   ├── app.js
│           │   └── favicon.png
│           ├── java/
│           │   └── com/sepo/certification/
│           │       └── MainActivity.java
│           ├── res/
│           │   ├── layout/
│           │   │   └── activity_main.xml
│           │   └── values/
│           │       ├── strings.xml
│           │       ├── colors.xml
│           │       └── styles.xml
│           └── AndroidManifest.xml
├── build.gradle
├── settings.gradle
└── gradle.properties
```

## Требования

- Android Studio 4.0 или выше
- Android SDK API 21+ (Android 5.0)
- Java 8 или выше
- Gradle 7.0+

## Установка и сборка

### 1. Открытие проекта в Android Studio

1. Запустите Android Studio
2. Выберите "Open an existing Android Studio project"
3. Укажите путь к папке `android-app`
4. Дождитесь синхронизации Gradle

### 2. Настройка сервера

Перед запуском приложения убедитесь, что ваш Node.js сервер запущен:

```bash
cd /path/to/your/sepo-project
npm start
```

Сервер должен быть доступен по адресу `http://localhost:3000`

### 3. Сборка APK

#### Debug версия:
1. В Android Studio выберите Build → Build Bundle(s) / APK(s) → Build APK(s)
2. APK файл будет создан в `app/build/outputs/apk/debug/app-debug.apk`

#### Release версия:
1. В Android Studio выберите Build → Generate Signed Bundle / APK
2. Следуйте инструкциям для создания keystore
3. Выберите APK
4. Выберите release build variant
5. APK файл будет создан в `app/build/outputs/apk/release/app-release.apk`

## Тестирование

### На эмуляторе:
1. Запустите Android эмулятор
2. В Android Studio нажмите "Run" (зеленая кнопка)
3. Выберите эмулятор
4. Приложение автоматически установится и запустится

### На реальном устройстве:
1. Подключите Android устройство через USB
2. Включите "Отладка по USB" в настройках разработчика
3. В Android Studio нажмите "Run"
4. Выберите ваше устройство
5. Приложение установится и запустится

## Особенности Android версии

### 1. WebView интеграция
Приложение использует WebView для отображения веб-интерфейса. Это позволяет:
- Использовать весь функционал веб-версии
- Легко обновлять интерфейс без пересборки APK
- Сохранить нативную производительность

### 2. Сетевое взаимодействие
- Приложение подключается к серверу через `10.0.2.2:3000` (localhost для эмулятора)
- Для реальных устройств нужно изменить IP адрес в `app.js`
- Поддерживается HTTPS и HTTP

### 3. Разрешения
Приложение запрашивает следующие разрешения:
- `INTERNET` - для подключения к серверу
- `ACCESS_NETWORK_STATE` - для проверки состояния сети
- `WRITE_EXTERNAL_STORAGE` - для сохранения файлов
- `READ_EXTERNAL_STORAGE` - для чтения файлов

## Настройка для продакшена

### 1. Изменение IP адреса сервера
В файле `app/src/main/assets/app.js` замените `10.0.2.2` на IP адрес вашего сервера:

```javascript
const API = {
    login: 'http://YOUR_SERVER_IP:3000/api/login',
    // ... остальные endpoints
}
```

### 2. Настройка HTTPS
Для безопасного соединения используйте HTTPS:

```javascript
const API = {
    login: 'https://YOUR_SERVER_IP:3000/api/login',
    // ... остальные endpoints
}
```

### 3. Подписание APK
Для распространения в Google Play Store необходимо подписать APK:

1. Создайте keystore: `keytool -genkey -v -keystore my-release-key.keystore -alias alias_name -keyalg RSA -keysize 2048 -validity 10000`
2. В Android Studio выберите Build → Generate Signed Bundle / APK
3. Укажите путь к keystore и пароли
4. Выберите release build variant

## Устранение неполадок

### Проблема: Приложение не подключается к серверу
**Решение:**
1. Убедитесь, что сервер запущен
2. Проверьте IP адрес в `app.js`
3. Убедитесь, что устройство/эмулятор имеет доступ к сети
4. Проверьте файрвол на сервере

### Проблема: Белый экран в приложении
**Решение:**
1. Откройте Developer Tools в Android Studio
2. Проверьте логи WebView
3. Убедитесь, что все файлы в `assets` корректны
4. Проверьте JavaScript ошибки

### Проблема: Приложение крашится при запуске
**Решение:**
1. Проверьте логи в Android Studio
2. Убедитесь, что все разрешения указаны в `AndroidManifest.xml`
3. Проверьте совместимость версий Android

## Обновление приложения

Для обновления веб-части приложения:
1. Измените файлы в `app/src/main/assets/`
2. Пересоберите APK
3. Установите новую версию

## Контакты

Для технической поддержки обращайтесь к разработчику.

## Лицензия

MIT License
