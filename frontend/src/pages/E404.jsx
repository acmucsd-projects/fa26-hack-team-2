import { useNavigate } from "react-router-dom";
import Button from "../components/Button/Button";

export default function E404() {
    const navigation = useNavigate()
    return (
        <div className="page-container">
            <h1> Error 404, page not found </h1>
            <Button children={<p>Go to dashboard</p>} onClick={() => navigation('/')} /> 
        </div>
    );
}