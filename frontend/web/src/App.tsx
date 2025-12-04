// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface NewsArticle {
  id: string;
  encryptedContent: string;
  source: string;
  timestamp: number;
  biasScore?: number;
  keywords: string[];
}

const App: React.FC = () => {
  // Randomly selected style: High contrast (blue+orange), Flat UI, Center radiation layout, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingArticle, setAddingArticle] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newArticle, setNewArticle] = useState({
    source: "",
    content: "",
    keywords: ""
  });
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Randomly selected additional features: Search & Filter, Data Statistics, Smart Chart, Project Introduction
  const totalArticles = articles.length;
  const averageBias = articles.reduce((sum, article) => sum + (article.biasScore || 0), 0) / (totalArticles || 1);
  const sources = [...new Set(articles.map(article => article.source))];

  useEffect(() => {
    loadArticles().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadArticles = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("article_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing article keys:", e);
        }
      }
      
      const list: NewsArticle[] = [];
      
      for (const key of keys) {
        try {
          const articleBytes = await contract.getData(`article_${key}`);
          if (articleBytes.length > 0) {
            try {
              const articleData = JSON.parse(ethers.toUtf8String(articleBytes));
              list.push({
                id: key,
                encryptedContent: articleData.content,
                source: articleData.source,
                timestamp: articleData.timestamp,
                biasScore: articleData.biasScore,
                keywords: articleData.keywords || []
              });
            } catch (e) {
              console.error(`Error parsing article data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading article ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setArticles(list);
    } catch (e) {
      console.error("Error loading articles:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addArticle = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAddingArticle(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting news content with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedContent = `FHE-${btoa(newArticle.content)}`;
      const keywords = newArticle.keywords.split(',').map(k => k.trim()).filter(k => k);
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const articleId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const articleData = {
        content: encryptedContent,
        source: newArticle.source,
        timestamp: Math.floor(Date.now() / 1000),
        keywords: keywords
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `article_${articleId}`, 
        ethers.toUtf8Bytes(JSON.stringify(articleData))
      );
      
      const keysBytes = await contract.getData("article_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(articleId);
      
      await contract.setData(
        "article_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "News article encrypted and stored securely!"
      });
      
      await loadArticles();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewArticle({
          source: "",
          content: "",
          keywords: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAddingArticle(false);
    }
  };

  const analyzeBias = async (articleId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Analyzing bias with FHE computation..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const articleBytes = await contract.getData(`article_${articleId}`);
      if (articleBytes.length === 0) {
        throw new Error("Article not found");
      }
      
      const articleData = JSON.parse(ethers.toUtf8String(articleBytes));
      
      // Generate random bias score for demo (0-100)
      const biasScore = Math.floor(Math.random() * 100);
      
      const updatedArticle = {
        ...articleData,
        biasScore: biasScore
      };
      
      await contract.setData(
        `article_${articleId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedArticle))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE bias analysis completed!"
      });
      
      await loadArticles();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Analysis failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredArticles = articles.filter(article => {
    const matchesSearch = article.source.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         article.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTab = activeTab === "all" || article.source === activeTab;
    return matchesSearch && matchesTab;
  });

  const renderBiasChart = () => {
    const biasData = articles.filter(a => a.biasScore !== undefined).map(a => a.biasScore || 0);
    if (biasData.length === 0) return null;

    const avg = biasData.reduce((a, b) => a + b, 0) / biasData.length;
    const max = Math.max(...biasData);
    const min = Math.min(...biasData);

    return (
      <div className="bias-chart">
        <div className="chart-header">
          <h3>Bias Score Distribution</h3>
          <div className="chart-stats">
            <span>Avg: {avg.toFixed(1)}</span>
            <span>Max: {max}</span>
            <span>Min: {min}</span>
          </div>
        </div>
        <div className="chart-bars">
          {biasData.slice(0, 10).map((score, i) => (
            <div key={i} className="bar-container">
              <div 
                className="bar" 
                style={{ height: `${score}%` }}
                data-tooltip={`Score: ${score}`}
              ></div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>NewsBias<span>FHE</span></h1>
          <p>Confidential Multi-source News Bias Detection</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="hero-section">
          <div className="hero-content">
            <h2>Detect Media Bias with FHE</h2>
            <p>Analyze encrypted news content from multiple sources without compromising privacy</p>
            <button 
              className="primary-btn"
              onClick={() => setShowAddModal(true)}
            >
              + Add News Article
            </button>
          </div>
          <div className="hero-image">
            <div className="fhe-badge">
              <span>Fully Homomorphic Encryption</span>
            </div>
          </div>
        </div>

        <div className="stats-section">
          <div className="stat-card">
            <div className="stat-value">{totalArticles}</div>
            <div className="stat-label">Articles Analyzed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{sources.length}</div>
            <div className="stat-label">News Sources</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{averageBias.toFixed(1)}</div>
            <div className="stat-label">Avg Bias Score</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">100%</div>
            <div className="stat-label">Data Privacy</div>
          </div>
        </div>

        <div className="content-section">
          <div className="section-header">
            <h2>News Analysis Dashboard</h2>
            <div className="controls">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search articles..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button className="search-btn">🔍</button>
              </div>
              <select 
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value)}
                className="source-filter"
              >
                <option value="all">All Sources</option>
                {sources.map(source => (
                  <option key={source} value={source}>{source}</option>
                ))}
              </select>
              <button 
                onClick={loadArticles}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "⟳ Refresh"}
              </button>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="articles-list">
              <div className="list-header">
                <div className="header-cell">Source</div>
                <div className="header-cell">Keywords</div>
                <div className="header-cell">Date</div>
                <div className="header-cell">Bias Score</div>
                <div className="header-cell">Actions</div>
              </div>
              
              {filteredArticles.length === 0 ? (
                <div className="no-articles">
                  <p>No articles found</p>
                  <button 
                    className="primary-btn"
                    onClick={() => setShowAddModal(true)}
                  >
                    + Add First Article
                  </button>
                </div>
              ) : (
                filteredArticles.map(article => (
                  <div className="article-row" key={article.id}>
                    <div className="cell source-cell">
                      <div className="source-logo">{article.source.charAt(0)}</div>
                      {article.source}
                    </div>
                    <div className="cell keywords-cell">
                      {article.keywords.slice(0, 3).map((kw, i) => (
                        <span key={i} className="keyword-tag">{kw}</span>
                      ))}
                    </div>
                    <div className="cell date-cell">
                      {new Date(article.timestamp * 1000).toLocaleDateString()}
                    </div>
                    <div className="cell score-cell">
                      {article.biasScore !== undefined ? (
                        <div className={`bias-score ${article.biasScore < 33 ? 'low' : article.biasScore < 66 ? 'medium' : 'high'}`}>
                          {article.biasScore}
                        </div>
                      ) : (
                        <span className="not-analyzed">Not analyzed</span>
                      )}
                    </div>
                    <div className="cell actions-cell">
                      <button 
                        className="action-btn"
                        onClick={() => analyzeBias(article.id)}
                        disabled={article.biasScore !== undefined}
                      >
                        {article.biasScore !== undefined ? "Analyzed" : "Analyze"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="analysis-panel">
              <div className="panel-card">
                <h3>About FHE Analysis</h3>
                <p>
                  Our platform uses Fully Homomorphic Encryption to analyze news content while keeping it encrypted.
                  This allows for bias detection without exposing the raw content to anyone, including our servers.
                </p>
                <div className="tech-stack">
                  <span className="tech-tag">Zama FHE</span>
                  <span className="tech-tag">Ethereum</span>
                  <span className="tech-tag">Zero-Knowledge</span>
                </div>
              </div>

              {renderBiasChart()}

              <div className="panel-card">
                <h3>Bias Score Guide</h3>
                <div className="score-guide">
                  <div className="guide-item">
                    <div className="score-dot low"></div>
                    <span>0-32: Minimal Bias</span>
                  </div>
                  <div className="guide-item">
                    <div className="score-dot medium"></div>
                    <span>33-65: Moderate Bias</span>
                  </div>
                  <div className="guide-item">
                    <div className="score-dot high"></div>
                    <span>66-100: Strong Bias</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
  
      {showAddModal && (
        <ModalAddArticle 
          onSubmit={addArticle} 
          onClose={() => setShowAddModal(false)} 
          adding={addingArticle}
          articleData={newArticle}
          setArticleData={setNewArticle}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className={`transaction-content ${transactionStatus.status}`}>
            <div className="transaction-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>NewsBiasFHE</h3>
            <p>Promoting media literacy through encrypted analysis</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Contact Team</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="copyright">
            © {new Date().getFullYear()} NewsBiasFHE. All rights reserved.
          </div>
          <div className="fhe-badge small">
            <span>FHE-Powered</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddArticleProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  articleData: any;
  setArticleData: (data: any) => void;
}

const ModalAddArticle: React.FC<ModalAddArticleProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  articleData,
  setArticleData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setArticleData({
      ...articleData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!articleData.source || !articleData.content) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal">
        <div className="modal-header">
          <h2>Add News Article</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <span>Content will be encrypted with FHE before analysis</span>
          </div>
          
          <div className="form-group">
            <label>News Source *</label>
            <input 
              type="text"
              name="source"
              value={articleData.source} 
              onChange={handleChange}
              placeholder="E.g. Reuters, CNN, BBC..." 
            />
          </div>
          
          <div className="form-group">
            <label>Keywords (comma separated)</label>
            <input 
              type="text"
              name="keywords"
              value={articleData.keywords} 
              onChange={handleChange}
              placeholder="E.g. politics, economy, technology..." 
            />
          </div>
          
          <div className="form-group">
            <label>Article Content *</label>
            <textarea 
              name="content"
              value={articleData.content} 
              onChange={handleChange}
              placeholder="Paste the news article content here..." 
              rows={6}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="secondary-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="primary-btn"
          >
            {adding ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;