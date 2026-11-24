"""Medidas objetivas entre duas fotos. Não é diagnóstico: só números de imagem."""
from PIL import Image, ImageChops, ImageOps, ImageStat, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 25_000_000      # protege contra imagens gigantes (decompression bomb)
SIZE = (256, 256)


class AnalysisError(Exception):
    """Entrada inválida. A mensagem é segura para exibir ao usuário."""


def load(file_storage) -> Image.Image:
    """Abre e valida a imagem, respeita a rotação EXIF e reduz o tamanho."""
    try:
        img = Image.open(file_storage.stream)
        if img.width * img.height > Image.MAX_IMAGE_PIXELS:
            raise AnalysisError("A imagem excede o limite de 25 megapixels.")
        img.verify()                               # confere a integridade
        file_storage.stream.seek(0)
        img = Image.open(file_storage.stream)
        if img.format not in ("JPEG", "PNG", "WEBP"):
            raise AnalysisError("Use imagens JPEG, PNG ou WEBP.")
        img = ImageOps.exif_transpose(img).convert("RGB")
    except AnalysisError:
        raise
    except Image.DecompressionBombError:
        raise AnalysisError("A imagem excede o limite de resolução.")
    except (UnidentifiedImageError, OSError, SyntaxError):
        raise AnalysisError("Não foi possível ler uma das imagens.")
    return img.resize(SIZE)


def measures(img: Image.Image) -> dict:
    r, g, b = ImageStat.Stat(img).mean
    brightness = ImageStat.Stat(img.convert("L")).mean[0]
    return {
        "brightness": round(brightness / 255 * 100, 1),   # 0 a 100
        "redness": round((r - g) / 255 * 100, 1),         # quanto o vermelho supera o verde
    }


def compare(before: Image.Image, after: Image.Image) -> dict:
    diff = ImageChops.difference(before, after)
    difference = sum(ImageStat.Stat(diff).mean) / 3 / 255 * 100
    return {"before": measures(before), "after": measures(after), "difference": round(difference, 1)}
