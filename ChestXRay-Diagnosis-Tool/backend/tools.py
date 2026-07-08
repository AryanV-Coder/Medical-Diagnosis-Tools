import os
from langchain_core.tools import tool
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEndpointEmbeddings
from ddgs import DDGS
from dotenv import load_dotenv

load_dotenv()

FAISS_DB_DIR = os.path.join(os.path.dirname(__file__), "faiss_db")

embeddings = HuggingFaceEndpointEmbeddings(
    model="sentence-transformers/all-MiniLM-L6-v2",
    huggingfacehub_api_token=os.getenv("HF_TOKEN"),
)

# Helper to retrieve from a specific FAISS index
def _retrieve_from_db(db_name: str, query: str, k: int = 3) -> str:
    db_path = os.path.join(FAISS_DB_DIR, db_name)
    if not os.path.isdir(db_path):
        return f"Database {db_name} not found."
    
    index = FAISS.load_local(
        db_path,
        embeddings,
        allow_dangerous_deserialization=True,
    )
    docs = index.similarity_search(query, k=k)
    if not docs:
        return "No relevant information found."
    return "\n\n".join([d.page_content for d in docs])

@tool
def search_cardiomegaly_db(query: str) -> str:
    """
    Search the local clinical database for information regarding Cardiomegaly (enlarged heart).
    Use this to look up definitions, causes, radiographic signs, and management guidelines for cardiomegaly.
    """
    return _retrieve_from_db("cardiomegaly", query)

@tool
def search_effusion_pneumothorax_db(query: str) -> str:
    """
    Search the local clinical database for information regarding Pleural Effusion and Pneumothorax.
    Use this to look up guidelines on fluid in the lungs, collapsed lungs, and related thoracic conditions.
    """
    return _retrieve_from_db("pleuraleffusion_pneumothorax", query)

@tool
def search_tuberculosis_db(query: str) -> str:
    """
    Search the local clinical database for information regarding Tuberculosis (TB).
    Use this to look up TB screening protocols, diagnostic criteria, and MoHFW/NTEP guidelines.
    """
    return _retrieve_from_db("tuberculosis", query)

@tool
def search_xray_dictionary(query: str) -> str:
    """
    Search the general Chest X-Ray Dictionary.
    Use this to look up basic anatomical terms, general radiographic signs, and fundamentals of reading chest X-rays.
    """
    return _retrieve_from_db("xraydictionary", query)

# Web Search Tool using the native DDGS client directly to avoid LangChain import errors
_ddgs_client = DDGS()

@tool
def clinical_web_search(query: str) -> str:
    """
    Search the web for up-to-date clinical information, guidelines, or medical facts NOT found in the local databases.
    This tool automatically restricts searches to trusted clinical domains (NIH, CDC, WHO, Mayo Clinic).
    Use this ONLY if the local databases do not contain the answer.
    """
    trusted_domains = "site:nih.gov OR site:cdc.gov OR site:who.int OR site:mayoclinic.org"
    restricted_query = f"{query} {trusted_domains}"
    
    try:
        results = _ddgs_client.text(restricted_query, max_results=3)
        if not results:
            return "No reliable medical information found on the web."
        
        # Combine the body/snippet of the top results
        return "\n\n".join([f"Source: {r.get('title', '')}\n{r.get('body', '')}" for r in results])
    except Exception as e:
        return f"Web search failed: {str(e)}"

# Export all tools for the agent
all_tools = [
    search_cardiomegaly_db,
    search_effusion_pneumothorax_db,
    search_tuberculosis_db,
    search_xray_dictionary,
    clinical_web_search
]
