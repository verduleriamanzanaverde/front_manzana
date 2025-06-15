import { useState } from "react";
import "./css/estilos.css";

const Encabezado = () => {
  const [menuActive, setMenuActive] = useState(false);

  return (
    <>
      <header>
        <div className="container">
          <button 
            className="menu-btn" 
            onClick={() => setMenuActive(!menuActive)}
            aria-label="Menú"
          >
            ☰
          </button>
          <p className="logo">Manzana Verde</p>
          <nav className={menuActive ? "active" : ""}>
            <a href="#buscar-productos" onClick={() => setMenuActive(false)}>Buscar productos</a>
            <a href="#balanza-voz" onClick={() => setMenuActive(false)}>Balanza por voz</a>
            <a href="#caracteristicas" onClick={() => setMenuActive(false)}>Características</a>
          </nav>
        </div>
      </header>
    </>
  );
};

export default Encabezado;