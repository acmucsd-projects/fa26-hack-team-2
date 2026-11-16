import { useNavigate } from "react-router-dom";
import Button from "../components/Button/Button";

export default function Settings() {
  const navigate = useNavigate();
  return (
    <div className="page-container">
      <h1>Settings</h1>
      <p>Wowwww so many settings!!!</p>
      <Button children={<p>dashboard</p>} onClick={() => navigate('/')} /> 
      spa
      <Button children={<p>login</p>} onClick={() => navigate('/login')} />
    </div>
  );
}