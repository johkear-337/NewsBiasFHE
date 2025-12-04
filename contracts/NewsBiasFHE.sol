// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract NewsBiasFHE is SepoliaConfig {
    struct EncryptedArticle {
        uint256 articleId;
        euint32 encryptedContent;      // Encrypted article content
        euint32 encryptedSentiment;    // Encrypted sentiment score
        euint32 encryptedKeywords;     // Encrypted keyword analysis
        uint256 timestamp;
    }
    
    struct BiasAnalysis {
        string biasScore;
        string comparisonResult;
        string mediaOutlet;
        bool isAnalyzed;
    }

    uint256 public articleCount;
    mapping(uint256 => EncryptedArticle) public articles;
    mapping(uint256 => BiasAnalysis) public analyses;
    
    mapping(string => euint32) private encryptedBiasCount;
    string[] private biasCategoryList;
    
    mapping(uint256 => uint256) private requestToArticleId;
    mapping(address => bool) private authorizedAnalysts;
    
    event ArticleSubmitted(uint256 indexed articleId, uint256 timestamp);
    event AnalysisRequested(uint256 indexed articleId);
    event AnalysisCompleted(uint256 indexed articleId);
    
    modifier onlyAnalyst() {
        require(authorizedAnalysts[msg.sender], "Unauthorized analyst");
        _;
    }
    
    constructor() {
        authorizedAnalysts[msg.sender] = true;
    }
    
    function authorizeAnalyst(address analyst) public onlyAnalyst {
        authorizedAnalysts[analyst] = true;
    }
    
    function submitEncryptedArticle(
        euint32 encryptedContent,
        euint32 encryptedSentiment,
        euint32 encryptedKeywords
    ) public onlyAnalyst {
        articleCount += 1;
        uint256 newId = articleCount;
        
        articles[newId] = EncryptedArticle({
            articleId: newId,
            encryptedContent: encryptedContent,
            encryptedSentiment: encryptedSentiment,
            encryptedKeywords: encryptedKeywords,
            timestamp: block.timestamp
        });
        
        analyses[newId] = BiasAnalysis({
            biasScore: "",
            comparisonResult: "",
            mediaOutlet: "",
            isAnalyzed: false
        });
        
        emit ArticleSubmitted(newId, block.timestamp);
    }
    
    function requestBiasAnalysis(uint256 articleId) public onlyAnalyst {
        EncryptedArticle storage article = articles[articleId];
        require(!analyses[articleId].isAnalyzed, "Analysis already completed");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(article.encryptedContent);
        ciphertexts[1] = FHE.toBytes32(article.encryptedSentiment);
        ciphertexts[2] = FHE.toBytes32(article.encryptedKeywords);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.analyzeBias.selector);
        requestToArticleId[reqId] = articleId;
        
        emit AnalysisRequested(articleId);
    }
    
    function analyzeBias(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 articleId = requestToArticleId[requestId];
        require(articleId != 0, "Invalid request");
        
        BiasAnalysis storage analysis = analyses[articleId];
        require(!analysis.isAnalyzed, "Analysis already completed");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        uint32 contentScore = results[0];
        uint32 sentiment = results[1];
        uint32 keywords = results[2];
        
        analysis.biasScore = calculateBiasScore(contentScore, sentiment);
        analysis.comparisonResult = compareWithBaseline(contentScore, sentiment);
        analysis.mediaOutlet = identifyMediaOutlet(keywords);
        analysis.isAnalyzed = true;
        
        if (FHE.isInitialized(encryptedBiasCount[analysis.biasScore]) == false) {
            encryptedBiasCount[analysis.biasScore] = FHE.asEuint32(0);
            biasCategoryList.push(analysis.biasScore);
        }
        encryptedBiasCount[analysis.biasScore] = FHE.add(
            encryptedBiasCount[analysis.biasScore], 
            FHE.asEuint32(1)
        );
        
        emit AnalysisCompleted(articleId);
    }
    
    function getBiasAnalysis(uint256 articleId) public view returns (
        string memory biasScore,
        string memory comparisonResult,
        string memory mediaOutlet,
        bool isAnalyzed
    ) {
        BiasAnalysis storage ba = analyses[articleId];
        return (ba.biasScore, ba.comparisonResult, ba.mediaOutlet, ba.isAnalyzed);
    }
    
    function getEncryptedBiasCount(string memory biasCategory) public view returns (euint32) {
        return encryptedBiasCount[biasCategory];
    }
    
    function requestBiasCountDecryption(string memory biasCategory) public onlyAnalyst {
        euint32 count = encryptedBiasCount[biasCategory];
        require(FHE.isInitialized(count), "Category not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptBiasCount.selector);
        requestToArticleId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(biasCategory)));
    }
    
    function decryptBiasCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public onlyAnalyst {
        uint256 biasCategoryHash = requestToArticleId[requestId];
        string memory biasCategory = getBiasCategoryFromHash(biasCategoryHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        uint32 count = abi.decode(cleartexts, (uint32));
    }
    
    // Bias analysis algorithms
    function calculateBiasScore(uint32 contentScore, uint32 sentiment) private pure returns (string memory) {
        uint32 score = (contentScore * 2 + sentiment * 3) / 5;
        if (score > 80) return "HighlyBiased";
        if (score > 60) return "ModeratelyBiased";
        if (score > 40) return "SlightlyBiased";
        return "Neutral";
    }
    
    function compareWithBaseline(uint32 contentScore, uint32 sentiment) private pure returns (string memory) {
        uint32 baseline = 50;
        uint32 contentDiff = contentScore > baseline ? contentScore - baseline : baseline - contentScore;
        uint32 sentimentDiff = sentiment > baseline ? sentiment - baseline : baseline - sentiment;
        
        if (contentDiff > 30 || sentimentDiff > 30) return "SignificantDeviation";
        if (contentDiff > 15 || sentimentDiff > 15) return "ModerateDeviation";
        return "WithinNormalRange";
    }
    
    function identifyMediaOutlet(uint32 keywords) private pure returns (string memory) {
        if (keywords % 5 == 0) return "OutletA";
        if (keywords % 5 == 1) return "OutletB";
        if (keywords % 5 == 2) return "OutletC";
        if (keywords % 5 == 3) return "OutletD";
        return "OutletE";
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getBiasCategoryFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < biasCategoryList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(biasCategoryList[i]))) == hash) {
                return biasCategoryList[i];
            }
        }
        revert("Category not found");
    }
}