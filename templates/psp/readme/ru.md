# Console Kitchen: {{hardware}}, прошивка {{firmware}}

Сгенерировано {{date}}.

## Компоненты

{{#components}}
- **{{name}}** {{version}}: {{description}}
{{/components}}
{{#hasManual}}

Скачать вручную: {{#manual}}**{{.}}** {{/manual}}
{{/hasManual}}

## Установка

1. Подключи PSP к компьютеру: **Settings → USB Connection**. Подойдёт и картридер.
2. Положи установщик в корень Memory Stick{{#go}} или внутренней памяти PSP Go{{/go}} и запусти его там:
   - Linux и macOS: `bash install.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
3. Безопасно извлеки карту и выйди из режима USB.

Установщик скачивает всё прямо на карту: файлы с совпадающими именами перезаписываются, остальное на карте остаётся как есть. GitHub разрешает 60 анонимных запросов к API в час, укажи `GITHUB_TOKEN`, если запускаешь установщик часто.
{{#update}}

## Обновление системы

ARK-5 работает на прошивках 6.60 и 6.61, а на PSP стоит {{firmware}}. Заряди батарею, подключи блок питания и сначала запусти **Game → Memory Stick → PSP Update ver 6.61**.
{{/update}}

## ARK-5

1. Запусти **Game → Memory Stick → FasterARK**: он установит ARK-5 и сразу его загрузит.
2. Запусти **CustomIPL** и установи cIPL, чтобы ARK-5 загружался вместе с консолью. Без cIPL запускай FasterARK заново после каждого выключения PSP.

Настройки ARK-5 лежат в `PSP/SAVEDATA/ARK_01234/SETTINGS.TXT`, меню настроек, которое ARK добавляет в XMB, пишет тот же файл.
{{#hasPlugins}}

## Плагины

`SEPLUGINS/PLUGINS.TXT` загружает:

{{#plugins}}
- **{{name}}**: {{runlevels}}
{{/plugins}}
{{/hasPlugins}}
