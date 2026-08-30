#include <cp5/Image.h>

#include <map>
#include <string>
#include <GLES2/gl2.h>
static std::map<int32_t, Image*>* sImages = NULL;
static std::map<int32_t, GLuint>* sTextures = NULL;
static std::map<int32_t, GLuint>* sTexturesRepeat = NULL;
static std::map<std::string, Image*>* sImagesByName = NULL;

namespace cp5 {

size_t num_images = 0;

Image::Image(const char *src){
	img = EM_ASM_INT({
		var img = new Image();
		img.src = UTF8ToString($0);
		
		for(var i = 0; i < cp5.images.length; ++i){
			if(cp5.images[i] != null) continue;
			cp5.images[i] = img;
			return i;
		}
		
		cp5.images.push(img);
		return cp5.images.length - 1;
	}, src);
	
    if (sImages==NULL)
        sImages = new std::map<int32_t, Image*>();
    if (sTextures==NULL)
        sTextures = new std::map<int32_t, GLuint>();
    if (sTexturesRepeat==NULL)
        sTexturesRepeat = new std::map<int32_t, GLuint>();
    if (sImagesByName==NULL)
        sImagesByName = new std::map<std::string, Image*>();
    sImages->insert({img, this});
    sImagesByName->insert({src, this});
    
	++num_images;
}

Image::~Image(){
	EM_ASM_ARGS({
		cp5.images[$0] = null;
	}, img);
	
    auto iti = sImages->find(img);
    if (iti!=sImages->end()) {
        sImages->erase(iti);
    }
    auto itt = sTextures->find(img);
    if (itt!=sTextures->end()) {
        glDeleteTextures(1, &itt->second);
        sTextures->erase(itt);
    }
    itt = sTexturesRepeat->find(img);
    if (itt!=sTexturesRepeat->end()) {
        glDeleteTextures(1, &itt->second);
        sTexturesRepeat->erase(itt);
    }
    for (auto entry : *sImagesByName) {
        if (entry.second == this) {
            auto itn = sImagesByName->find(entry.first);
            if (itn!=sImagesByName->end()) {
                sImagesByName->erase(itn);
            }
            break;
        }
    }
    
	--num_images;
}

void Image::GetInfo() const {
	EM_ASM_ARGS({
		var i = cp5.images[$0];
	
		HEAPU8[$1 >> 0] = (i.complete && i.width > 0)|0;
		HEAP32[$2 >> 2] = i.width;
		HEAP32[$3 >> 2] = i.height;
	}, img, &hasLoaded, &width, &height);
}


}

GLuint GetTextureIdForImageId(int32_t imgId, bool repeat) {
    if (sImages==NULL || sTextures==NULL || sTexturesRepeat==NULL)
        return 0;
    
    if (repeat) {
        auto itt = sTexturesRepeat->find(imgId);
        if (itt!=sTexturesRepeat->end())
            return itt->second;
    } else {
        auto itt = sTextures->find(imgId);
        if (itt!=sTextures->end())
            return itt->second;
    }
    
    auto it = sImages->find(imgId);
    if (it==sImages->end() || !it->second->HasLoaded())
        return 0;
    
    int32_t width, height;
    width = it->second->Width();
    height = it->second->Height();
    
    //cp5::Context context;
    //context.Init();
    //context.SetSize(width, height);
    //context.DrawImage(it->second, 0, 0);
    
    void* data = (void*)malloc(width*height*4);
    
    //context.GetImageData(data, width, height);
    
    EM_ASM_ARGS({
        var ctx = document.createElement('canvas').getContext('2d');
        var canvas = ctx.canvas;
        canvas.width = $1;
        canvas.height = $2;
        ctx.drawImage(cp5.images[$0], 0, 0);
        var imageData = ctx.getImageData(0, 0, $1, $2);
        var array = new Uint8Array(Module.HEAPU8.buffer, $3, $1*$2*4);
        array.set(new Uint8Array(imageData.data));
    }, imgId, width, height, data);
    
    GLuint name;
    glPixelStorei(GL_UNPACK_ALIGNMENT,1);
    glGenTextures(1, &name);
    glBindTexture(GL_TEXTURE_2D, name);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, repeat ? GL_REPEAT : GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, repeat ? GL_REPEAT : GL_CLAMP_TO_EDGE);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, (GLsizei)width, (GLsizei)height, 0, GL_RGBA, GL_UNSIGNED_BYTE, data);
    
    if (repeat) {
        sTexturesRepeat->insert({imgId, name});
    } else {
        sTextures->insert({imgId, name});
    }
    
    free(data);
    
    return name;
}

cp5::Image* GetImageForName(const char* name) {
    if (sImagesByName==NULL)
        sImagesByName = new std::map<std::string, Image*>();
    
    auto it = sImagesByName->find(name);
    if (it!=sImagesByName->end())
        return it->second;
    
    cp5::Image* image = new Image(name);
    sImagesByName->insert({name, image});
    
    return image;
}
