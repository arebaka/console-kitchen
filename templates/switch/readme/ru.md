# Console Kitchen: {{hardware}}, Horizon OS {{hos}}

Сгенерировано {{date}}.

## Компоненты

{{#components}}
- **{{name}}** {{version}}: {{description}}
{{/components}}
{{#hasManual}}

Скачать вручную: {{#manual}}**{{.}}** {{/manual}}
{{/hasManual}}

## Установка

1. Отформатируй SD-карту в **FAT32**: консоль поддерживает exFAT, но на нём файлы склонны портиться.
2. Положи установщик в корень SD-карты и запусти его там:
   - Linux и macOS: `bash install.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
3. Безопасно извлеки карту и вставь её в консоль.

Установщик скачивает всё прямо на карту: файлы с совпадающими именами перезаписываются, остальное на карте остаётся как есть. GitHub разрешает 60 анонимных запросов к API в час, укажи `GITHUB_TOKEN`, если запускаешь установщик часто.

Чтобы потом обновить карту, положи `dump.sh` или `dump.ps1` в её корень и запусти, затем открой `console-kitchen-dump.toml` в Console Kitchen через **Файл → Открыть**: на шаге сборки появятся `update.sh` и `update.ps1`. Для этого установщик оставляет сборку и файлы каждого компонента в `{{trace}}/`.
{{#cardUpdate}}

## Обновление карты

`update.sh` и `update.ps1` приводят карту, с которой снят снимок, к этой сборке. Положи один из них в корень этой карты и запусти там:

- Linux и macOS: `bash update.sh`
- Windows: `powershell -ExecutionPolicy Bypass -File update.ps1`

Что делает обновление:

{{#added}}
- Добавляет {{added}}
{{/added}}
{{#refreshed}}
- Скачивает заново то, у чего вышел новый релиз: {{refreshed}}
{{/refreshed}}
{{#removed}}
- Удаляет {{removed}}, их конфиги остаются на карте
{{/removed}}
{{#written}}
- Переписывает конфиги, в которых поменялись опции: {{written}}. Остальные остаются как на карте
{{/written}}
{{#moved}}
- Переносит пункты других сборок в More configs: {{moved}}
{{/moved}}
{{#disabled}}
- Выключает сисмодули других сборок: {{disabled}}
{{/disabled}}
{{#deleted}}
- Удаляет то, что оставили другие сборки: {{deleted}}
{{/deleted}}

Всё, что обновление перезаписывает или удаляет, ложится в `backup/` на карте с теми же путями: скопируй обратно, чтобы вернуть. Конфиг, изменённый на карте после снимка, остаётся как есть, сделай снимок заново, чтобы его поменять. В конце обновление удаляет снимок: в нём конфиги с паролями.
{{/cardUpdate}}

## Первый запуск

{{#modchip}}
Включи консоль: чип загрузит `payload.bin` (Hekate) из корня SD-карты.
{{/modchip}}
{{^modchip}}
1. Выключи консоль, вставь RCM-джиг в правую направляющую Joy-Con, зажми **VOL+** и нажми **POWER**. Экран останется чёрным: консоль в режиме RCM.
2. Подключи консоль к компьютеру по USB и отправь `hekate_ctcaer_*.bin` из корня SD-карты через TegraRcmGUI на Windows или fusee-launcher на Linux и macOS.
{{/modchip}}

Запустится Hekate{{#autoboot}} и загрузит **{{autoboot}}**, зажми **VOL-** во время экрана загрузки, чтобы попасть в меню{{/autoboot}}.

## emuMMC

Держи системную NAND чистой и запускай CFW из emuMMC:

1. Сделай бэкап NAND в Hekate: **Tools → Backup eMMC**.
2. Создай emuMMC: **emuMMC → Create emuMMC → SD File**. **SD Partition** быстрее, но сначала требует **Tools → Partition SD Card**.
3. Загрузи **Launch → CFW (emuMMC)**.
{{#hasEmummcs}}

Другие emuMMC загружаются своими пунктами, каждая из своей папки:

{{#emummcs}}
- **Launch → {{name}}**: `emuMMC/{{folder}}`
{{/emummcs}}

Создай каждую так же, папки Hekate называет сам: SD00, SD01 и дальше для файлов, RAW1–RAW3 для разделов. **CFW (emuMMC)** загружает ту, что выбрана в **emuMMC → Change emuMMC**.
{{/hasEmummcs}}
{{#dnsBlock}}

Серверы Nintendo заблокированы в {{dnsTargets}}: обновления, eShop и онлайн-игра там не работают.
{{/dnsBlock}}
{{#hasSystems}}

## Другие системы

Hekate загружает их своими пунктами вместо Horizon OS:

{{#systems}}
- **Launch → {{name}}**. {{note}}
{{/systems}}
{{/hasSystems}}
{{#hasSpares}}

## Если CFW не загружается

То, что Hekate подгружает для некоторых компонентов, собрано под один релиз Atmosphere и после обновления может не дать системе стартовать. В **More configs** лежат пункты, которые загружают CFW без этого:

{{#spares}}
- **{{.}}**
{{/spares}}
{{/hasSpares}}
