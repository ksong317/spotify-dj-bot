import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import GraphPage from './pages/GraphPage.jsx';
import SetListPage from './pages/SetListPage.jsx';
import SetListsPage from './pages/SetListsPage.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/setlists" element={<SetListsPage />} />
        <Route path="/setlists/:setListId" element={<SetListPage />} />
        <Route path="*" element={<Navigate to="/setlists" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
