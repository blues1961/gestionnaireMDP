import React from 'react';
import { lockVault } from '../utils/vaultSession';

export default function KeyImportForm() {
  return <div className="stack"><p>Pour restaurer un fichier de secours, verrouillez la voûte puis utilisez l’import de secours. La clé sera vérifiée avant toute écriture.</p><button className="btn" onClick={() => lockVault()}>Verrouiller et restaurer une clé</button></div>;
}
