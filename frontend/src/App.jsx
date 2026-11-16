import { BrowserRouter } from 'react-router-dom'
import { Routes } from 'react-router-dom';
import { Route } from 'react-router-dom';
import './App.css'
// import pages...
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import E404 from './pages/E404';
import Login from './pages/Login';

export default function App() {
  return (
    <div className ="help me god">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings /> } />
          <Route path="/login" element={<Login /> } />

          {/*  if no valid path is found */}
          <Route path="*" element={<E404 /> } />
        </Routes>
      </BrowserRouter>
    </div>

    /* // <BrowserRouter>
    //   <Routes>
    //     <Route path="/" element={<Dashboard />} />
    //     <Route path="/settings" element={<Settings />} />
    //   </Routes>
    // </BrowserRouter> */
  );
}
