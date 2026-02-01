"""
Semantic Visual Fingerprint Engine
Convierte screenshots en vectores 768D usando CLIP
"""

from transformers import CLIPProcessor, CLIPModel
import torch
from PIL import Image
import numpy as np
import sys
import json
import os

class SemanticFingerprintEngine:
    def __init__(self, model_name="openai/clip-vit-large-patch14"):
        """
        Inicializa CLIP model
        Args:
            model_name: CLIP variant (default: large-patch14 = 768D)
        """
        # Suppress symlink warnings on Windows
        os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
        
        try:
            # print(f"[SemanticFingerprint] Loading {model_name}...", file=sys.stderr)
            self.model = CLIPModel.from_pretrained(model_name)
            self.processor = CLIPProcessor.from_pretrained(model_name)
            self.model.eval()
            
            # GPU acceleration si disponible
            if torch.cuda.is_available():
                self.model = self.model.cuda()
                # print("[SemanticFingerprint] Using GPU", file=sys.stderr)
            else:
                pass 
                # print("[SemanticFingerprint] Using CPU", file=sys.stderr)
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.exit(1)
    
    def create_fingerprint(self, image_path):
        """
        Screenshot -> 768D vector
        """
        try:
            # Load image
            image = Image.open(image_path)
            
            # Process con CLIP
            inputs = self.processor(images=image, return_tensors="pt")
            
            if torch.cuda.is_available():
                inputs = {k: v.cuda() for k, v in inputs.items()}
            
            # Generate embedding
            with torch.no_grad():
                outputs = self.model.get_image_features(**inputs)
            
            # Extract image embeddings
            if isinstance(outputs, torch.Tensor):
                image_features = outputs
            else:
                # Handle unexpected object return (BaseModelOutputWithPooling)
                # This object usually contains the raw vision output.
                # We need to project it to the shared embedding space.
                if hasattr(outputs, 'pooler_output'):
                    feat = outputs.pooler_output
                    # Adaptive projection: If already 768, skip. If 1024, project.
                    if feat.shape[-1] == 768:
                        image_features = feat
                    elif feat.shape[-1] == 1024:
                         image_features = self.model.visual_projection(feat)
                    else:
                         return {"error": f"Unexpected feature dimension: {feat.shape[-1]}"}
                elif hasattr(outputs, 'image_embeds'):
                    image_features = outputs.image_embeds
                else: 
                     return {"error": f"Unknown output type from get_image_features: {type(outputs)}"}

            # L2 normalization (using safe functional call)
            # image_features is (Batch, Dim)
            fingerprint = torch.nn.functional.normalize(image_features, p=2, dim=-1)
            
            # Return as list (JSON serializable)
            vector = fingerprint.cpu().numpy().flatten().tolist()
            
            return {
                "vector": vector,
                "dimension": len(vector),
                "model": "clip-vit-large-patch14"
            }
        except Exception as e:
            return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({"error": "Usage: python semantic_fingerprint.py <image_path>"}))
        sys.exit(1)
    
    image_path = sys.argv[1]
    
    if not os.path.exists(image_path):
        print(json.dumps({"error": f"File not found: {image_path}"}))
        sys.exit(1)

    # Initialize engine
    engine = SemanticFingerprintEngine()
    
    # Generate fingerprint
    result = engine.create_fingerprint(image_path)
    
    # Output JSON a stdout
    print(json.dumps(result))
