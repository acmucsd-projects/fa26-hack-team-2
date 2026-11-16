import Button from '../components/Button/Button'
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const navigate = useNavigate();
  return (  
    <div className="page-container">
      <h1>Dashboard</h1>
      <p>this board is so fast. its a *dash*board</p>
      <Button children={<p>settings</p>} onClick={() => navigate('/settings')} />
      <Button children={<p>login</p>} onClick={() => navigate('/settings')} />
    </div>
  );
}