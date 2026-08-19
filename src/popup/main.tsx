import { createRoot } from 'react-dom/client';
import { PopupApp } from './PopupApp';
import './popup.css';

const root = document.getElementById('root')!;
createRoot(root).render(<PopupApp />);
