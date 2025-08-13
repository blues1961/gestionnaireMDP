import { useNavigate } from "react-router-dom";
import playbookMd from "../docs/operational-playbook.md?raw";
import "./Help.css";

export default function Help() {
  const navigate = useNavigate();

  return (
    <main className="help">
      <header className="help__header">
       
     
        <h1 className="help__title">Aide</h1>
         <button
          type="button"
          className="help__back"
          onClick={() => navigate("/vault")}
          aria-label="Retour à la voûte"
        >
          ← Retour à la voûte
        </button>
      </header>

      <section className="help__content">
        <pre>
          {playbookMd}
        </pre>
      
      

      </section>
    </main>
  );
}
