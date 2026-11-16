import Button from '../components/Button/Button'
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const navigate = useNavigate();
  return (  
    <div className="page-container">
      <h1>Login</h1>
      <p>You log in here.</p>
      <Button children={<p>dashboard</p>} onClick={() => navigate('/')} />
    </div>
  );
}