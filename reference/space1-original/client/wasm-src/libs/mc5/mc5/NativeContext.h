static int sNextContextId = 0;

class NativeContext : public EmptyContext {
private:
    struct NVGcontext* vg;
    int width;
    int height;
    std::map<int32_t, int>* imageIds;
    std::map<int32_t, int>* ctxIds;
    std::vector<int>* tmpImageIds;
    std::vector<NVGpaint>* paintIds;
    NVGLUframebuffer* frameBuffer;
    bool frameBufferRendered;
    int frameBufferMainContextImage;
    double fontSize;
    MCTextRendererTypes::Color fontColor;
    MCTextRendererTypes::Color fontOutlineColor;
    double fontOutlineWidth;
    double globalAlpha;
    bool dirty;
    int32_t ctx;

public:
    NativeContext() {
        width = 0;
        height = 0;
        vg = NULL;
        frameBuffer = NULL;
        fontSize = 12;
        fontOutlineWidth = 0;
        fontColor = MCTextRendererColorFromRGBAf(0.0f, 0.0f, 0.0f, 0.0f);
        fontOutlineColor = MCTextRendererColorFromRGBAf(0.0f, 0.0f, 0.0f, 0.0f);
        globalAlpha = 0;
        imageIds = new std::map<int32_t, int>();
        ctxIds = new std::map<int32_t, int>();
        tmpImageIds = new std::vector<int>();
        paintIds = new std::vector<NVGpaint>();
        dirty = true;
        ctx = sNextContextId++;
    }
    
    virtual void SetSize(int w, int h) {
        dirty = true;
        if(w <= 0) w = 1;
        if(h <= 0) h = 1;
        
        if (!sDefaultViewportSet) {
            sDefaultViewportSet = true;
            glGetIntegerv(GL_VIEWPORT, sDefaultViewport);
        }
        
        if (width==w && height==h)
            return;
        
        width = w;
        height = h;
        
        if (vg==NULL) {
#ifdef TARGET_OS_MAC
            vg = nvgCreateGL2(NVG_ANTIALIAS | NVG_STENCIL_STROKES);
#else
            vg = nvgCreateGLES2(0 /*NVG_ANTIALIAS | NVG_STENCIL_STROKES*/);
#endif
        }
        
        if (sMainContext==NULL) {
            sMainContext = vg;
            frameBuffer = NULL;
        }
        else if (frameBuffer==NULL) {
            frameBuffer = nvgluCreateFramebuffer(vg, NATIVE_CONTEXT_FRAMEBUFFER_SIZE, NATIVE_CONTEXT_FRAMEBUFFER_SIZE, 0);
#ifdef TARGET_OS_MAC
            frameBufferMainContextImage = nvglCreateImageFromHandleGL2(sMainContext, nvglImageHandleGL2(vg, frameBuffer->image), NATIVE_CONTEXT_FRAMEBUFFER_SIZE, NATIVE_CONTEXT_FRAMEBUFFER_SIZE, NVG_IMAGE_NODELETE | NVG_IMAGE_FLIPY | NVG_IMAGE_PREMULTIPLIED);
#else
            frameBufferMainContextImage = nvglCreateImageFromHandleGLES2(sMainContext, nvglImageHandleGLES2(vg, frameBuffer->image), NATIVE_CONTEXT_FRAMEBUFFER_SIZE, NATIVE_CONTEXT_FRAMEBUFFER_SIZE, NVG_IMAGE_NODELETE | NVG_IMAGE_FLIPY | NVG_IMAGE_PREMULTIPLIED);
#endif
        }
        frameBufferRendered = true;
    }
    
    ~NativeContext() {
        if (frameBuffer!=NULL) {
            nvgluDeleteFramebuffer(frameBuffer);
            nvgDeleteImage(sMainContext, frameBufferMainContextImage);
        }

        for (int imageId : *tmpImageIds) {
            nvgDeleteImage(vg, imageId);
        }
        
        for (auto entry : *imageIds) {
            nvgDeleteImage(vg, entry.second);
        }
        
        for (auto entry : *ctxIds) {
            nvgDeleteImage(vg, entry.second);
        }
        
#ifdef TARGET_OS_MAC
        nvgDeleteGL2(vg);
#else
        nvgDeleteGLES2(vg);
#endif
        delete imageIds;
        delete ctxIds;
        delete tmpImageIds;
        delete paintIds;
    }
    
    int GetNanoVGImageId(Context *src, int32_t ctx) {
        EmptyContext* nativeContext = sContexts->at(ctx);
        int32_t w, h;
        nativeContext->GetSize(&w, &h);
        int nanoImgId = 0;
        bool update = true;
        auto it = ctxIds->find(ctx);
        if (it!=ctxIds->end()) {
            if (nativeContext->IsDirty()==false) {
                nanoImgId = it->second;
                update = false;
            } else {
                nvgDeleteImage(vg, it->second);
                ctxIds->erase(it);
            }
        }
        if (update) {
            void* data = (void*)malloc((size_t)(w*h*4));
            nativeContext->GetPixelData(data);
            nanoImgId = nvgCreateImageRGBA(sMainContext, (int)w, (int)h, 0, (unsigned char*)data);
            ctxIds->insert({ctx, nanoImgId});
            free(data);
        }
        return nanoImgId;
    }
    
    int GetNanoVGImageId(Image* src, int32_t imgId, bool repeat) {
        int flags = repeat ? NVG_IMAGE_REPEATX | NVG_IMAGE_REPEATY : 0;
        dirty = true;
        int nanoImgId = 0;
        auto it = imageIds->find(imgId);
        if (it!=imageIds->end()) {
            nanoImgId = it->second;
        }
        else {
            if (GetTextureIdForImageId(imgId, repeat)==0)
                return 0;
#ifdef TARGET_OS_MAC
            nanoImgId = nvglCreateImageFromHandleGL2(vg, GetTextureIdForImageId(imgId, repeat), src->Width(), src->Height(), flags);
#else
            nanoImgId = nvglCreateImageFromHandleGLES2(vg, GetTextureIdForImageId(imgId, repeat), src->Width(), src->Height(), flags);
#endif
            imageIds->insert({imgId, nanoImgId});
        }
        return nanoImgId;
    }
    
    virtual void GetSize(int32_t *width, int32_t *height) {
        *width = this->width;
        *height = this->height;
    }

    virtual int GetWidth() {
        return width;
    }
    
    virtual int GetHeight() {
        return height;
    }
    
    virtual void EnterFramebuffer() {
        nvgluBindFramebuffer(frameBuffer);
        if (frameBuffer!=NULL) {
            glViewport(0, 0, width, height);
            //if (frameBufferRendered) {
                frameBufferRendered = false;
                glClearColor(0.0, 0.0, 0.0, 0.0);
                glClear(GL_COLOR_BUFFER_BIT);
                nvgBeginFrame(vg, width, height, 1.0);
            //}
        }
    }
    
    virtual void ExitFramebuffer() {
        if (frameBuffer!=NULL) {
            glViewport(sDefaultViewport[0], sDefaultViewport[1], sDefaultViewport[2], sDefaultViewport[3]);
            nvgluBindFramebuffer(NULL);
        }
    }
    
    virtual void FinishFramebuffer() {
        if (frameBufferRendered)
            return;
        EnterFramebuffer();
        frameBufferRendered = true;
        nvgEndFrame(vg);
        ExitFramebuffer();
    }
    
    virtual void Save() {
        NATIVE_CONTEXT_DRAW_START;
        nvgSave(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void Restore() {
        NATIVE_CONTEXT_DRAW_START;
        nvgRestore(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void Fill() {
        dirty = true;
        NATIVE_CONTEXT_DRAW_START;
        nvgFill(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void Stroke() {
        dirty = true;
        NATIVE_CONTEXT_DRAW_START;
        nvgStroke(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void StrokeWidth(uint32_t width = 1) {
        NATIVE_CONTEXT_DRAW_START;
        nvgStrokeWidth(vg, (float)width);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void Clip() {
        NATIVE_CONTEXT_DRAW_START;
        //nvgClip(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void BeginPath() {
        NATIVE_CONTEXT_DRAW_START;
        nvgBeginPath(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void ClosePath() {
        NATIVE_CONTEXT_DRAW_START;
        nvgClosePath(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void Rect(double x, double y, double w, double h) {
        NATIVE_CONTEXT_DRAW_START;
        nvgBeginPath(vg);
        nvgRect(vg, (float)x, (float)y, (float)w, (float)h);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void ClearRect(double x, double y, double w, double h) {
        NATIVE_CONTEXT_DRAW_START;
        nvgBeginPath(vg);
        nvgRect(vg, (float)x, (float)y, (float)w, (float)h);
        nvgFill(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void FillRect(double x, double y, double w, double h) {
        dirty = true;
        NATIVE_CONTEXT_DRAW_START;
        nvgBeginPath(vg);
        nvgRect(vg, (float)x, (float)y, (float)w, (float)h);
        nvgFill(vg);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void FillColor(unsigned char r, unsigned char g, unsigned char b) {
        fontColor.r = ((float)r)/255.0f;
        fontColor.g = ((float)g)/255.0f;
        fontColor.b = ((float)b)/255.0f;
        NATIVE_CONTEXT_DRAW_START;
        nvgFillColor(vg, nvgRGBA(r, g, b, 255));
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual int CreateRadialGradient(double xStart, double yStart, double radiusStart, double xEnd, double yEnd, double radiusEnd) {
        return 0;
    }
    
    virtual int CreateLinearGradient(double x0, double y0, double x1, double y1) {
        return 0;
    }
    
    virtual void SetGlobalCompositeOperation(const char* compositeOperation) {
    }
    
    virtual void FillStyle(const char* fillStyle) {
    }
    
    virtual void SetFillStyleFromGradient(int gradientID) {
    }
    
    virtual void SetStrokeStyleFromGradient(int gradientID) {
    }
    
    virtual void GradientAddColorStop(int gradientID, double offset, uint8_t r, uint8_t g, uint8_t b, double a) {
    }
    
    virtual void StrokeColor(unsigned char r, unsigned char g, unsigned char b) {
        fontOutlineColor.r = ((float)r)/255.0f;
        fontOutlineColor.g = ((float)g)/255.0f;
        fontOutlineColor.b = ((float)b)/255.0f;
        NATIVE_CONTEXT_DRAW_START;
        nvgStrokeColor(vg, nvgRGBA(r, g, b, 255));
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void SetAlpha(double v) {
        globalAlpha = v;
        fontColor.a = (float)v;
        fontOutlineColor.a = (float)v;
        NATIVE_CONTEXT_DRAW_START;
        nvgGlobalAlpha(vg, (float)v);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual double GetAlpha() {
        return globalAlpha;
    }
    
    virtual void MoveTo(double x, double y) {
        NATIVE_CONTEXT_DRAW_START;
        nvgMoveTo(vg, (float)x, (float)y);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void LineTo(double x, double y) {
        NATIVE_CONTEXT_DRAW_START;
        nvgLineTo(vg, (float)x, (float)y);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void Arc(double x, double y, double radius, double startAngle, double endAngle, bool anticlockwise) {
        NATIVE_CONTEXT_DRAW_START;
        nvgArc(vg, (float)x, (float)y, (float)radius, (float)startAngle, (float)endAngle, anticlockwise?NVG_CCW:NVG_CW);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void Ellipse(double x, double y, double radiusX, double radiusY, double rotation, double startAngle, double endAngle, bool anticlockwise) {
    }
    
    virtual void Scale(double x, double y) {
        NATIVE_CONTEXT_DRAW_START;
        nvgScale(vg, (float)x, (float)y);
        NATIVE_CONTEXT_DRAW_END;
    }

    virtual void Rotate(double v) {
        NATIVE_CONTEXT_DRAW_START;
        nvgRotate(vg, (float)v);
        NATIVE_CONTEXT_DRAW_END;
    }

    virtual void Translate(double x, double y) {
        NATIVE_CONTEXT_DRAW_START;
        nvgTranslate(vg, (float)x, (float)y);
        NATIVE_CONTEXT_DRAW_END;
    }

    virtual void SetLineWidth(double v) {
        fontOutlineWidth = v;
        NATIVE_CONTEXT_DRAW_START;
        nvgStrokeWidth(vg, (float)v);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void SetLineCap(cp5::ctx_line_cap v) {
        NATIVE_CONTEXT_DRAW_START;
        if (v==cp5::CTX_LINE_CAP_BUTT)
            nvgLineCap(vg, NVG_BUTT);
        else if (v==cp5::CTX_LINE_CAP_ROUND)
            nvgLineCap(vg, NVG_ROUND);
        else if (v==cp5::CTX_LINE_CAP_SQUARE)
            nvgLineCap(vg, NVG_SQUARE);
        NATIVE_CONTEXT_DRAW_END;
    }
    
    virtual void DrawImageWithTint(Image *src, int32_t imgId, const Color &c, double dx, double dy, double dw, double dh) {
        dirty = true;
    }
    
    virtual void DrawImage(Context *src, int32_t ctx, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh) {
        dirty = true;
#if 1
        int nanoImgId = GetNanoVGImageId(src, ctx);
        EmptyContext* nativeContext = sContexts->at(ctx);
        int32_t w, h;
        nativeContext->GetSize(&w, &h);
        NATIVE_CONTEXT_DRAW_START;
        float ox = dx-(sx*(dw/sw));
        float oy = dy-(sy*(dh/sh));
        float ex = (float)dw*((float)w/(float)sw);
        float ey = (float)dh*((float)h/(float)sh);
        NVGpaint imgPaint = nvgImagePattern(vg, ox, oy, ex, ey, 0.0f/180.0f*NVG_PI, nanoImgId, 1.0);
        nvgBeginPath(vg);
        nvgRect(vg, (float)dx, (float)dy, (float)dw, (float)dh);
        nvgFillPaint(vg, imgPaint);
        nvgFill(vg);
        NATIVE_CONTEXT_DRAW_END;
#else
        EmptyContext* nativeContext = sContexts->at(ctx);
        int nanoImgId = -1;
        float xOffset = 0.0f;
        float yOffset = 0.0f;
        float xScale = 1.0f;
        float yScale = 1.0f;
        if (nativeContext->tmpImageIds->size()==0) {
            nativeContext->FinishFramebuffer();
            //nativeContext->SavePixels();
            nanoImgId = nativeContext->frameBufferMainContextImage;
            yOffset = 1.0f;
            xScale = (float)NATIVE_CONTEXT_FRAMEBUFFER_SIZE/(float)nativeContext->GetWidth();
            yScale = (float)NATIVE_CONTEXT_FRAMEBUFFER_SIZE/(float)nativeContext->GetHeight();
        }
        else {
            nanoImgId = nativeContext->tmpImageIds->back();
            yOffset = 0.0f;
        }
        NATIVE_CONTEXT_DRAW_START;
        NVGpaint imgPaint = nvgImagePattern(vg, (float)dx+xOffset, (float)dy+yOffset, (float)dw*xScale, (float)dh*yScale, 0.0f/180.0f*NVG_PI, nanoImgId, 1.0);
		nvgBeginPath(vg);
		nvgRect(vg, (float)dx, (float)dy, (float)dw, (float)dh);
		nvgFillPaint(vg, imgPaint);
		nvgFill(vg);
        NATIVE_CONTEXT_DRAW_END;
#endif
    }
    
    virtual void DrawImage(Image *src, int32_t imgId, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh) {
        dirty = true;
        int nanoImgId = GetNanoVGImageId(src, imgId, false);
        NATIVE_CONTEXT_DRAW_START;
        float ox = dx-(sx*(dw/sw));
        float oy = dy-(sy*(dh/sh));
        float ex = (float)dw*((float)src->Width()/(float)sw);
        float ey = (float)dh*((float)src->Height()/(float)sh);
        NVGpaint imgPaint = nvgImagePattern(vg, ox, oy, ex, ey, 0.0f/180.0f*NVG_PI, nanoImgId, 1.0);
		nvgBeginPath(vg);
        nvgRect(vg, (float)dx, (float)dy, (float)dw, (float)dh);
		nvgFillPaint(vg, imgPaint);
		nvgFill(vg);
        NATIVE_CONTEXT_DRAW_END;
    }

    virtual void FillText(const char *str, double x, double y) {
        dirty = true;
#ifdef EMSCRIPTEN
        EM_ASM({
            console.trace("FillText");
        });
#else
        if (tmpImageIds->size()>0) {
            int nanoImgId = tmpImageIds->front();
            tmpImageIds->erase(tmpImageIds->begin());
            nvgDeleteImage(sMainContext, nanoImgId);
        }
        MCTextRendererProperties* properties = CreateTextProperties(str, GET_FONT_NAME("OpenSans-Bold.ttf"), (float)(fontSize*2.0), MCTextRendererTypes::HorizontalAlignment::HorizontalAlignmentCenter);
        properties->setFontColor(fontColor);
        properties->setOutlineColor(fontOutlineColor);
        properties->setOutlineWidth((float)fontOutlineWidth);
        int pixelSize = properties->getPixelFormat()==MCTextRendererTypes::PixelFormat::PixelFormat_8888 ? 4:1;
        void* data = (void*)calloc((size_t)(width*2), (size_t)(height*2 * pixelSize));
        int drawX = (int)floor(x);
        int drawY = (int)floor(y-(height/2.0));
//#warning hack anchor point in center?
        float drawW = (float)(floor(width)-drawX);
        float drawH = (float)(floor(height)-drawY);
        MCTEXTRENDERER_SHARED->renderText(properties, (int)drawX*2, (int)drawY*2, (float)(drawW*2.0), (float)(drawH*2.0), (int)width*2, (int)height*2, data);
        delete properties;
        int nanoImgId = nvgCreateImageRGBA(sMainContext, (int)width*2, (int)height*2, 0, (unsigned char*)data);
        tmpImageIds->push_back(nanoImgId);
        free(data);
#endif
    }

    virtual void StrokeText(const char *str, double x, double y) {
        dirty = true;
#ifdef EMSCRIPTEN
        EM_ASM({
            console.trace("StrokeText");
        });
#endif
    }

    virtual double MeasureText(const char *str) {
#ifdef EMSCRIPTEN
        EM_ASM({
            console.trace("MeasureText");
        });
        return 0;
#else
        float width = 0;
        float height = 0;
        MCTextRendererProperties* properties = CreateTextProperties(str, GET_FONT_NAME("OpenSans-Bold.ttf"), (float)fontSize, MCTextRendererTypes::HorizontalAlignment::HorizontalAlignmentLeft);
        properties->setFontColor(fontColor);
        properties->setOutlineColor(fontOutlineColor);
        properties->setOutlineWidth((float)fontOutlineWidth);
        MCTEXTRENDERER_SHARED->checkSizeOfText(properties, 1024, 1024, &width, &height);
        delete properties;
        return width;
#endif
    }

    virtual void SetFontSize(double px) {
        fontSize = px;
    }
    
    virtual void SetTextAlign(ctx_text_align v) {
    }
    
    virtual void SetLineJoin(ctx_line_join v) {
    }
    
    virtual void SetMiterLimit(double v) {
    }
    
    virtual void SetTextBaseline(ctx_text_baseline v) {
    }
    
    virtual void SetLineDash(double a, double b) {
    }
    
    virtual void ClearLineDash() {
    }
    
    virtual void SetLineDashOffset(double v) {
    }
    
    virtual void ShadowBlur(uint8_t val, uint8_t r, uint8_t g, uint8_t b) {
    }
    
    static bool HaveFontsLoaded() {
        return true;
    }
    
    virtual void Reset() {
        for (int imageId : *tmpImageIds) {
            nvgDeleteImage(vg, imageId);
        }
        tmpImageIds->clear();
    }
    
    virtual void* GetPixels(int& w, int& h) {
        nvgluBindFramebuffer(frameBuffer);
        glViewport(0, 0, width, height);
        w = width;
        h = height;
        void* data = (void*)malloc((size_t)(width*height*4));
        glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, data);
        glViewport(sDefaultViewport[0], sDefaultViewport[1], sDefaultViewport[2], sDefaultViewport[3]);
        nvgluBindFramebuffer(NULL);
        return data;
    }
    
    virtual void SavePixels() {
#if 0
#if defined __ANDROID__
        NSString* basePath = @"/sdcard";
#elif defined __MAC__
        NSString* basePath = @"";
#else
        NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
        NSString *basePath = paths.firstObject;
#endif
        const char* path = [[basePath stringByAppendingPathComponent:@"tmp.raw"] UTF8String];
        int w,h;
        void* data = GetPixels(w, h);
        FILE* fp = fopen(path, "wb");
        printf("SavePixels: %s %d %d\n", path, w, h);
        fwrite(data, 1, w*h*4, fp);
        fclose(fp);
        free(data);
#endif
    }
    
    virtual void GetPixelData(void* data) {
        dirty = false;
        nvgluBindFramebuffer(frameBuffer);
        glViewport(0, 0, width, height);
        glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, data);
        glViewport(sDefaultViewport[0], sDefaultViewport[1], sDefaultViewport[2], sDefaultViewport[3]);
        nvgluBindFramebuffer(NULL);
    }
    
    virtual void BeginFrame(int width, int height) {
        SetSize(width, height);
        glViewport(0, 0, width, height);
        nvgBeginFrame(vg, width, height, 1.0);
        FillColor(0, 0, 0);
    }
    
    virtual void EndFrame() {
        nvgEndFrame(vg);
        CleanupNativeContexts();
    }
    
    virtual bool IsDirty() {
        return dirty;
    }
    
    virtual int CreatePattern(Image* src, int32_t imgId) {
        int nanoImgId = GetNanoVGImageId(src, imgId, true);
        NVGpaint paint = nvgImagePattern(vg, 0, 0, src->Width(), src->Height(), 0.0f/180.0f*NVG_PI, nanoImgId, 1.0);
        int i = paintIds->size();
        paintIds->push_back(paint);
        return i;
    }
    
    virtual int CreatePattern(Context* src, int32_t ctxId) {
        int i = 0;
        return i;
    }
    
    virtual void FillPattern(int id, double x, double y, double w, double h) {
    }
    
    virtual void FillStylePattern(int id) {
        nvgFillPaint(vg, paintIds->at(id));
    }
    
    virtual int32_t GetId() {
        return ctx;
    }
};
