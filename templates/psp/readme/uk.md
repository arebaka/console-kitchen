# Console Kitchen: {{hardware}}, прошивка {{firmware}}

Згенеровано {{date}}.

## Компоненти

{{#components}}
- **{{name}}** {{version}}: {{description}}
{{/components}}
{{#hasManual}}

Завантажити вручну: {{#manual}}**{{.}}** {{/manual}}
{{/hasManual}}

## Встановлення

1. Підключи PSP до комп’ютера: **Settings → USB Connection**. Підійде й картрідер.
2. Поклади інсталятор у корінь Memory Stick{{#go}} або внутрішньої пам’яті PSP Go{{/go}} й запусти його там:
   - Linux і macOS: `bash install.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
3. Безпечно вийми карту й вийди з режиму USB.

Інсталятор завантажує все просто на карту: файли зі збіжними іменами перезаписуються, решта на карті лишається як є. GitHub дозволяє 60 анонімних запитів до API на годину, вкажи `GITHUB_TOKEN`, якщо запускаєш інсталятор часто.

Щоб згодом оновити карту, поклади `dump.sh` або `dump.ps1` у її корінь і запусти, потім відкрий `console-kitchen-dump.toml` у Console Kitchen через **Файл → Відкрити**: на кроці збірки з’являться `update.sh` і `update.ps1`. Для цього інсталятор лишає збірку й файли кожного компонента в `{{trace}}/`.
{{#cardUpdate}}

## Оновлення карти

`update.sh` і `update.ps1` приводять карту, з якої знято знімок, до цієї збірки. Поклади один із них у корінь цієї карти й запусти там:

- Linux і macOS: `bash update.sh`
- Windows: `powershell -ExecutionPolicy Bypass -File update.ps1`

Що робить оновлення:

{{#added}}
- Додає {{added}}
{{/added}}
{{#refreshed}}
- Завантажує наново те, для чого вийшов новий реліз: {{refreshed}}
{{/refreshed}}
{{#removed}}
- Видаляє {{removed}}, їхні конфіги лишаються на карті
{{/removed}}
{{#written}}
- Переписує конфіги, у яких змінилися опції: {{written}}. Решта лишається як на карті
{{/written}}
{{#deleted}}
- Видаляє те, що лишили інші збірки: {{deleted}}
{{/deleted}}

Усе, що оновлення перезаписує або видаляє, лягає в `backup/` на карті з тими самими шляхами: скопіюй назад, щоб повернути. Конфіг, змінений на карті після знімка, лишається як є, зроби знімок наново, щоб його змінити. Наприкінці оновлення видаляє знімок: у ньому конфіги з паролями.
{{/cardUpdate}}
{{#update}}

## Оновлення системи

ARK-5 працює на прошивках 6.60 і 6.61, а на PSP стоїть {{firmware}}. Зарядь батарею, підключи блок живлення й спершу запусти **Game → Memory Stick → PSP Update ver 6.61**.
{{/update}}

## ARK-5

1. Запусти **Game → Memory Stick → FasterARK**: він встановить ARK-5 і одразу його завантажить.
2. Запусти **CustomIPL** і встанови cIPL, щоб ARK-5 завантажувався разом із консоллю. Без cIPL запускай FasterARK знову після кожного вимкнення PSP.

Налаштування ARK-5 лежать у `PSP/SAVEDATA/ARK_01234/SETTINGS.TXT`, меню налаштувань, яке ARK додає в XMB, пише той самий файл.
{{#hasPlugins}}

## Плагіни

`SEPLUGINS/PLUGINS.TXT` завантажує:

{{#plugins}}
- **{{name}}**: {{runlevels}}
{{/plugins}}
{{/hasPlugins}}
