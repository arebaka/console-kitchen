import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';

import '@fontsource/biz-udpgothic/latin-400.css';
import '@fontsource/biz-udpgothic/latin-700.css';
// The font of the PSP only loads while its theme shows
import '@fontsource/m-plus-1p/latin-400.css';
import '@fontsource/m-plus-1p/latin-700.css';
import '@fontsource/m-plus-1p/cyrillic-400.css';
import '@fontsource/m-plus-1p/cyrillic-700.css';
import '@arelive/reset.css/reset.min.css';
import '@styles/main.scss';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
