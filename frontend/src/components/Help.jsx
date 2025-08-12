import React from "react";
// Vite permet d'importer un fichier comme texte brut avec ?raw
import playbook from "../docs/operational-playbook.md?raw";

export default function Help(){
  return (
    <main style={{maxWidth: 900, margin: "24px auto", padding: "0 16px", fontFamily: "system-ui"}}>
      <h1 style={{marginTop:0}}>Aide & Documentation</h1>
      <p style={{color:"#666", marginTop: -6}}>Plan de reprise, commandes Docker, backups, Git.</p>
      <article
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 16,
          background: "#fff",
          lineHeight: 1.5,
          overflowX: "auto",
          whiteSpace: "normal"
        }}
      >
        {/* On affiche le Markdown brut si on ne veut pas ajouter de dépendance de parsing. */}
        {/* Option simple: <pre> ; Option + jolis titres: parser markdown (ex: marked) */}
        <pre style={{whiteSpace:"pre-wrap", wordBreak:"break-word", margin:0, fontFamily:"inherit"}}>
{playbook}
        </pre>
      </article>
      <div style={{marginTop:12, fontSize:12, color:"#888"}}>
        Astuce: ce contenu vient de <code>docs/operational-playbook.md</code>. Mettez-le à jour depuis le repo.
      </div>
    </main>
  );
}
