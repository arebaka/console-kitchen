# Console Kitchen: {{hardware}}, Horizon OS {{hos}}

Згенеровано {{date}}.

## Компоненти

{{#components}}
- **{{name}}** {{version}}: {{description}}
{{/components}}
{{#hasManual}}

Завантажити вручну: {{#manual}}**{{.}}** {{/manual}}
{{/hasManual}}

## Встановлення

1. Відформатуй SD-карту у **FAT32**: консоль підтримує exFAT, але на ньому файли схильні псуватися.
2. Поклади інсталятор у корінь SD-карти й запусти його там:
   - Linux і macOS: `bash install.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
3. Безпечно вийми карту й встав її в консоль.

Інсталятор завантажує все просто на карту: файли зі збіжними іменами перезаписуються, решта на карті лишається як є. GitHub дозволяє 60 анонімних запитів до API на годину, вкажи `GITHUB_TOKEN`, якщо запускаєш інсталятор часто.

## Перший запуск

{{#modchip}}
Увімкни консоль: чип завантажить `payload.bin` (Hekate) з кореня SD-карти.
{{/modchip}}
{{^modchip}}
1. Вимкни консоль, встав RCM-джиг у праву напрямну Joy-Con, затисни **VOL+** і натисни **POWER**. Екран лишиться чорним: консоль у режимі RCM.
2. Підключи консоль до комп’ютера через USB і надішли `hekate_ctcaer_*.bin` з кореня SD-карти через TegraRcmGUI на Windows або fusee-launcher на Linux і macOS.
{{/modchip}}

Запуститься Hekate{{#autoboot}} і завантажить **{{autoboot}}**, затисни **VOL-** під час екрана завантаження, щоб потрапити в меню{{/autoboot}}.

## emuMMC

Тримай системну NAND чистою й запускай CFW з emuMMC:

1. Зроби бекап NAND у Hekate: **Tools → Backup eMMC**.
2. Створи emuMMC: **emuMMC → Create emuMMC → SD File**. **SD Partition** швидший, але спершу потребує **Tools → Partition SD Card**.
3. Завантаж **Launch → CFW (emuMMC)**.
{{#hasEmummcs}}

Інші emuMMC завантажуються власними пунктами, кожна зі своєї теки:

{{#emummcs}}
- **Launch → {{name}}**: `emuMMC/{{folder}}`
{{/emummcs}}

Створи кожну так само, теки Hekate називає сам: SD00, SD01 і далі для файлів, RAW1–RAW3 для розділів. **CFW (emuMMC)** завантажує ту, що вибрана в **emuMMC → Change emuMMC**.
{{/hasEmummcs}}
{{#dnsBlock}}

Сервери Nintendo заблоковано в {{dnsTargets}}: оновлення, eShop і онлайн-гра там не працюють.
{{/dnsBlock}}
{{#hasSpares}}

## Якщо CFW не завантажується

Те, що Hekate підвантажує для деяких компонентів, зібрано під один реліз Atmosphere і після оновлення може не дати системі стартувати. У **More configs** лежать пункти, які завантажують CFW без цього:

{{#spares}}
- **{{.}}**
{{/spares}}
{{/hasSpares}}
