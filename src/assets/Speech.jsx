import React, { useEffect, useState, useRef } from "react";
import "./speech.css";

const Speech = () => {
  // Cargar datos iniciales desde localStorage
  const loadFromLocalStorage = (key, defaultValue) => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    } catch (error) {
      console.error("Error al cargar de localStorage:", error);
      return defaultValue;
    }
  };

  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [quantity, setQuantity] = useState("");
  const [fruit, setFruit] = useState("");
  const [price, setPrice] = useState(null);
  const [total, setTotal] = useState(loadFromLocalStorage('speechApp_total', 0));
  const [history, setHistory] = useState(loadFromLocalStorage('speechApp_history', []));
  const [feedback, setFeedback] = useState("");
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const recognitionRef = useRef(null);
  const restartTimeoutRef = useRef(null);

  // Cargar productos desde el backend al iniciar
  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      setConnectionError(false);
      try {
        const response = await fetch("https://back-manzana.onrender.com/productos");
        if (!response.ok) throw new Error("Error al cargar productos");
        const data = await response.json();
        setProducts(data);
      } catch (error) {
        console.error("Error fetching products:", error);
        setFeedback("Error al cargar productos del almacén");
        setConnectionError(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Guardar en localStorage cuando cambien los datos
  useEffect(() => {
    const saveToLocalStorage = (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.error("Error al guardar en localStorage:", error);
      }
    };

    saveToLocalStorage('speechApp_history', history);
    saveToLocalStorage('speechApp_total', total);
  }, [history, total]);

  // Configuración del reconocimiento de voz
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setFeedback("Lo siento, tu navegador no soporta dictado por voz. Usa Chrome o Edge.");
      return;
    }

    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.lang = "es-AR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onresult = (event) => {
      const last = event.results.length - 1;
      const text = event.results[last][0].transcript.toLowerCase();
      
      setRecognizedText(text);
      processVoiceCommand(text);
      
      stopRecognition();
      restartTimeoutRef.current = setTimeout(() => {
        startRecognition();
      }, 1000);
    };

    recognition.onerror = (event) => {
      console.error("Error:", event.error);
      setFeedback(`Error: ${getErrorMessage(event.error)}`);
      restartTimeoutRef.current = setTimeout(() => {
        startRecognition();
      }, 1000);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [products]); // Ahora depende de products para evitar cierres durante la carga

  // Función para buscar productos en el backend
  const searchProductInBackend = async (productName) => {
    if (products.length === 0) return null;

    try {
      // Normalizar el nombre del producto
      const normalized = productName
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z]/g, "");

      // Primero buscar coincidencia exacta
      const exactMatch = products.find(p => {
        const productNameNormalized = p.nombre
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        return productNameNormalized === normalized;
      });
      
      if (exactMatch) return exactMatch.precio;

      // Si no hay coincidencia exacta, buscar coincidencia parcial
      let bestMatch = null;
      let maxLength = 0;
      
      for (const product of products) {
        const productNameNormalized = product.nombre
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        
        if (normalized.includes(productNameNormalized) && productNameNormalized.length > maxLength) {
          bestMatch = product;
          maxLength = productNameNormalized.length;
        }
      }

      return bestMatch ? bestMatch.precio : null;
    } catch (error) {
      console.error("Error buscando producto:", error);
      return null;
    }
  };

  const processVoiceCommand = async (text) => {
    if (text.split(' ').length < 2 && !text.match(/^(total|reiniciar)/i)) {
      console.log("Comando demasiado corto, ignorado:", text);
      return;
    }

    if (text.match(/^total/i)) {
      announceTotal();
      return;
    }

    if (text.match(/^(reiniciar|borrar)/i)) {
      resetAll();
      return;
    }

    const patterns = [
      /^(\d+)\s*(kilos?|kg|gramos?|gr|unidades?|u)?\s+de\s+(.+)$/i,
      /^(\d+)\s+(.+)$/i,
      /^(.+)\s+(\d+)$/i
    ];

    let match = null;
    for (const pattern of patterns) {
      match = text.match(pattern);
      if (match) break;
    }

    if (match && match[1] && (match[3] || match[2])) {
      let detectedQuantity = match[1].trim();
      let detectedFruit = (match[3] || match[2]).trim().toLowerCase();
      detectedFruit = cleanProductName(detectedFruit);
      
      // Buscar el producto en el backend
      const productPrice = await searchProductInBackend(detectedFruit);
      
      if (productPrice) {
        const itemTotal = productPrice * parseInt(detectedQuantity);
        
        setQuantity(detectedQuantity);
        setFruit(detectedFruit);
        setPrice(productPrice);
        setTotal(prev => prev + itemTotal);
        
        setHistory(prev => {
          const newHistory = [
            ...prev,
            {
              product: detectedFruit,
              quantity: detectedQuantity,
              price: productPrice,
              total: itemTotal,
              timestamp: new Date().toLocaleTimeString()
            }
          ];
          return newHistory;
        });
        
        setFeedback(`✅ Agregado: ${detectedQuantity} ${getUnit(text)} de ${detectedFruit} - $${itemTotal}`);
        speakFeedback(`Agregado ${detectedQuantity} de ${detectedFruit}`);
      } else {
        setFeedback(`⚠️ Producto "${detectedFruit}" no encontrado. Intenta nuevamente.`);
        speakFeedback(`Producto ${detectedFruit} no reconocido`);
      }
    } else {
      setFeedback("No entendí. Di algo como '2 kilos de manzana' o 'total' para ver el total.");
    }
  };

  const announceTotal = () => {
    const savedHistory = loadFromLocalStorage('speechApp_history', []);
    const savedTotal = loadFromLocalStorage('speechApp_total', 0);
    
    if (savedHistory.length === 0) {
      setFeedback("No hay productos en la lista");
      speakFeedback("Aún no hay productos agregados");
      return;
    }

    const totalMessage = `El total acumulado es ${savedTotal} pesos por ${savedHistory.length} productos.`;
    setFeedback(totalMessage);
    speakFeedback(totalMessage);
    
    stopRecognition();
    restartTimeoutRef.current = setTimeout(() => {
      startRecognition();
    }, 3000);
  };

  const speakFeedback = (text) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-AR';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const cleanProductName = (name) => {
    return name.replace(/^(las|los|la|el|unos|unas|un|una)\s+/i, '')
               .replace(/\s+$/i, '')
               .replace(/\s*\b\d+\b\s*/i, '');
  };

  const getUnit = (text) => {
    if (text.includes('kilo') || text.includes('kg')) return 'kilos';
    if (text.includes('gramo') || text.includes('gr')) return 'gramos';
    if (text.includes('unidad') || text.includes('u')) return 'unidades';
    return 'unidades';
  };

  const getErrorMessage = (error) => {
    const errors = {
      'no-speech': 'No se detectó voz',
      'audio-capture': 'No se pudo capturar audio',
      'not-allowed': 'Permiso denegado',
      'aborted': 'Reconocimiento abortado',
      'network': 'Error de red',
      'language-not-supported': 'Idioma no soportado'
    };
    return errors[error] || 'Error desconocido';
  };

  const startRecognition = () => {
    if (recognitionRef.current && !isListening) {
      setFeedback("Escuchando... Di algo como '2 kilos de manzana'");
      recognitionRef.current.start();
      setIsListening(true);
      setRecognizedText("");
      setQuantity("");
      setFruit("");
    }
  };

  const stopRecognition = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const resetAll = () => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    
    setTotal(0);
    setHistory([]);
    setFeedback("Total reiniciado. Puedes comenzar una nueva venta.");
    speakFeedback("Total reiniciado");
  };

  const reloadProducts = async () => {
    setIsLoading(true);
    setConnectionError(false);
    try {
      const response = await fetch("https://back-manzana.onrender.com/productos");
      if (!response.ok) throw new Error("Error al cargar productos");
      const data = await response.json();
      console.log(data)
      setProducts(data);
      setFeedback("Productos actualizados correctamente");
    } catch (error) {
      console.error("Error recargando productos:", error);
      setFeedback("Error al actualizar productos");
      setConnectionError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="speech-container">
      <h1 className="title">Sistema de Voz para Almacén</h1>
      
      {isLoading && (
        <div className="loading">
          <p>Cargando productos del almacén...</p>
        </div>
      )}
      
      {connectionError && (
        <div className="error-connection">
          <p>Error de conexión con el servidor</p>
          <button onClick={reloadProducts} className="retry-button">
            Reintentar
          </button>
        </div>
      )}
      
      <div className="instructions">
        <p>Instrucciones:</p>
        <ol>
          <li>Haz clic en "Iniciar Micrófono"</li>
          <li>Di la cantidad y el producto, ejemplo: "2 kilos de manzana"</li>
          <li>El sistema procesará automáticamente y se preparará para el siguiente</li>
          <li>Di "total" para escuchar el total acumulado</li>
          <li>Di "reiniciar" para borrar todo</li>
        </ol>
      </div>
      
      <div className="controls">
        <button 
          onClick={startRecognition} 
          disabled={isListening || isLoading}
          className={`mic-button ${isListening ? 'listening' : ''}`}
        >
          {isListening ? (
            <span className="pulse-animation">🎤 Escuchando...</span>
          ) : (
            "Iniciar Micrófono"
          )}
        </button>
        
        <button 
          onClick={stopRecognition} 
          disabled={!isListening} 
          className="stop-button"
        >
          Detener Micrófono
        </button>
        
        <button 
          onClick={resetAll} 
          className="reset-button"
        >
          Reiniciar Todo
        </button>
      </div>
      
      {feedback && (
        <div className={`feedback ${feedback.includes('Error') || feedback.includes('⚠️') ? 'error' : ''}`}>
          {feedback}
        </div>
      )}
      
      <div className="current-info">
        {recognizedText && (
          <div className="recognized-text">
            <p><strong>Último comando:</strong> {recognizedText}</p>
          </div>
        )}
        
        {fruit && (
          <div className="product-info">
            <p><strong>Último producto:</strong> {quantity} {getUnit(recognizedText)} de {fruit} - ${price * parseInt(quantity)}</p>
          </div>
        )}
      </div>
      
      <div className="results">
        {history.length > 0 && (
          <div className="history-section">
            <h3>Detalle de la Venta:</h3>
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, index) => (
                  <tr key={index}>
                    <td>{item.timestamp}</td>
                    <td>{item.product}</td>
                    <td>{item.quantity}</td>
                    <td>${item.price}</td>
                    <td>${item.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4" className="total-label">Total:</td>
                  <td className="total-amount">${total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Speech;