class WebContext : public EmptyContext {
private:
    int32_t ctx;
    bool dirty;

public:
    
    WebContext(int32_t ctx) {
        this->ctx = ctx;
        dirty = true;
    }
    
    ~WebContext() {
#ifdef EMSCRIPTEN
        EM_ASM_ARGS({
            cp5.contexts[$0] = null;
        }, ctx);
#endif
    }
    
    virtual void SetSize(int32_t width, int32_t height) {
        dirty = true;
        EM_ASM_ARGS({
            var canvas = cp5.contexts[$0].canvas;
            canvas.width = $1;
            canvas.height = $2;
        }, ctx, width, height);
    }

    virtual void GetSize(int32_t *width, int32_t *height) {
        EM_ASM_ARGS({
            var canvas = cp5.contexts[$0].canvas;
            HEAP32[$1 >> 2] = canvas.width;
            HEAP32[$2 >> 2] = canvas.height;
        }, ctx, width, height);
    }

    virtual void Save() {
        EM_ASM_ARGS({
            cp5.contexts[$0].save();
        }, ctx);
    }

    virtual void Restore() {
        EM_ASM_ARGS({
            cp5.contexts[$0].restore();
        }, ctx);
    }

    virtual void Fill() {
        dirty = true;
        EM_ASM_ARGS({
            cp5.contexts[$0].fill();
        }, ctx);
    }

    virtual void Stroke() {
        dirty = true;
        EM_ASM_ARGS({
            cp5.contexts[$0].stroke();
        }, ctx);
    }

    virtual void StrokeWidth(uint32_t width = 1) {
        EM_ASM_ARGS({
            cp5.contexts[$0].lineWidth = $1;
        }, ctx, width);
    }

    virtual void Clip() {
        EM_ASM_ARGS({
            cp5.contexts[$0].clip();
        }, ctx);
    }

    virtual void BeginPath() {
        EM_ASM_ARGS({
            cp5.contexts[$0].beginPath();
        }, ctx);
    }

    virtual void ClosePath() {
        EM_ASM_ARGS({
            cp5.contexts[$0].closePath();
        }, ctx);
    }

    virtual void Rect(double x, double y, double w, double h) {
        EM_ASM_ARGS({
            cp5.contexts[$0].rect($1, $2, $3, $4);
        }, ctx, x, y, w, h);
    }

    virtual void ClearRect(double x, double y, double w, double h) {
        EM_ASM_ARGS({
            cp5.contexts[$0].clearRect($1, $2, $3, $4);
        }, ctx, x, y, w, h);
    }

    virtual void FillRect(double x, double y, double w, double h) {
        dirty = true;
        EM_ASM_ARGS({
            cp5.contexts[$0].fillRect($1, $2, $3, $4);
        }, ctx, x, y, w, h);
    }

    virtual void FillColor(uint8_t r, uint8_t g, uint8_t b) {
        EM_ASM_ARGS({
            cp5.contexts[$0].fillStyle = 'rgb(' + $1 + ',' + $2 + ',' + $3 + ')';
        }, ctx, r, g, b);
    }

    virtual int CreateRadialGradient(double xStart, double yStart, double radiusStart, double xEnd, double yEnd, double radiusEnd) {
        return EM_ASM_INT({
            var gradient = cp5.contexts[$0].createRadialGradient($1, $2, $3, $4, $5, $6);
            cp5.gradients.push(gradient);
            return cp5.gradients.length - 1;
        }, ctx, xStart, yStart, radiusStart, xEnd, yEnd, radiusEnd);
    }

    virtual int CreateLinearGradient(double x0, double y0, double x1, double y1) {
        return EM_ASM_INT({
            var gradient = cp5.contexts[$0].createLinearGradient($1, $2, $3, $4);
            cp5.gradients.push(gradient);
            return cp5.gradients.length - 1;
        }, ctx, x0, y0, x1, y1);
    }

    virtual void SetGlobalCompositeOperation(const char* compositeOperation) {
        EM_ASM_ARGS({
            cp5.contexts[$0].globalCompositeOperation = UTF8ToString($1);
        }, ctx, compositeOperation);
    }

    virtual void FillStyle(const char* fillStyle) {
        EM_ASM_ARGS({
            cp5.contexts[$0].fillStyle = UTF8ToString($1);
        }, ctx, fillStyle);
    }

    virtual void SetFillStyleFromGradient(int gradientID) {
        EM_ASM_ARGS({
            var gradient = cp5.gradients[$1];
            cp5.contexts[$0].fillStyle = gradient;
        }, ctx, gradientID);
    }

    virtual void SetStrokeStyleFromGradient(int gradientID) {
        EM_ASM_ARGS({
            var gradient = cp5.gradients[$1];
            cp5.contexts[$0].strokeStyle = gradient;
        }, ctx, gradientID);
    }

    virtual void GradientAddColorStop(int gradientID, double offset, uint8_t r, uint8_t g, uint8_t b, double a) {
        EM_ASM_ARGS({
            cp5.gradients[$0].addColorStop($1, 'rgba(' + $2 + ',' + $3 + ',' + $4 + ',' + $5 +')');
        }, gradientID, offset, r, g, b, a);
    }

    /*virtual void GradientAddColorStop(int gradientID, double offset, const char *color)
    {
        EM_ASM_ARGS({
            cp5.gradients[$0].addColorStop($1, UTF8ToString($2));
        }, gradientID, offset, color);
    }*/

    virtual void StrokeColor(uint8_t r, uint8_t g, uint8_t b) {
        EM_ASM_ARGS({
            cp5.contexts[$0].strokeStyle = 'rgb(' + $1 + ',' + $2 + ',' + $3 + ')';
        }, ctx, r, g, b);
    }

    virtual void SetAlpha(double v) {
        EM_ASM_ARGS({
            cp5.contexts[$0].globalAlpha = $1;
        }, ctx, v);
    }

    virtual double GetAlpha() {
        return EM_ASM_DOUBLE({
            return cp5.contexts[$0].globalAlpha;
        }, ctx);
    }

    virtual void MoveTo(double x, double y) {
        EM_ASM_ARGS({
            cp5.contexts[$0].moveTo($1, $2);
        }, ctx, x, y);
    }

    virtual void LineTo(double x, double y) {
        EM_ASM_ARGS({
            cp5.contexts[$0].lineTo($1, $2);
        }, ctx, x, y);
    }

    virtual void Arc(double x, double y, double radius, double startAngle, double endAngle, bool anticlockwise) {
        EM_ASM_ARGS({
            cp5.contexts[$0].arc($1, $2, $3, $4, $5, $6);
        }, ctx, x, y, radius, startAngle, endAngle, anticlockwise);
    }

    virtual void Ellipse(double x, double y, double radiusX, double radiusY, double rotation, double startAngle, double endAngle, bool anticlockwise) {
        EM_ASM_ARGS({
            cp5.contexts[$0].ellipse($1, $2, $3, $4, $5, $6, $7, $8);
        }, ctx, x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise);
    }
        
    virtual void Scale(double x, double y) {
        EM_ASM_ARGS({
            cp5.contexts[$0].scale($1, $2);
        }, ctx, x, y);
    }

    virtual void Rotate(double v) {
        EM_ASM_ARGS({
            cp5.contexts[$0].rotate($1);
        }, ctx, v);
    }

    virtual void Translate(double x, double y) {
        EM_ASM_ARGS({
            cp5.contexts[$0].translate($1, $2);
        }, ctx, x, y);
    }

    virtual void SetLineWidth(double v) {
        EM_ASM_ARGS({
            cp5.contexts[$0].lineWidth = $1;
        }, ctx, v);
    }

    virtual void DrawImageWithTint(Image *src, int32_t imgId, const Color &c, double dx, double dy, double dw, double dh) {
        dirty = true;
        EM_ASM_ARGS({
            var buffer = document.createElement('canvas');
            buffer.width = $4;
            buffer.height = $5;
            bx = buffer.getContext('2d');
            
            // fill offscreen buffer with the tint color
            bx.fillStyle = 'rgb(' + $6 + ',' + $7 + ',' + $8 + ')';
            bx.fillRect(0, 0,buffer.width,buffer.height);
            
            // destination atop makes a result with an alpha channel identical to fg, but with all pixels retaining their original color *as far as I can tell*
            bx.globalCompositeOperation = "destination-atop";
            
            var img = cp5.images[$1];
            if(!img.complete) return;
            bx.drawImage(img, 0, 0, img.width, img.height, 0, 0, $4, $5);
            
            //then set the global alpha to the amound that you want to tint it, and draw the buffer directly on top of it.
            cp5.contexts[$0].drawImage(img,$2, $3, $4, $5);
            cp5.contexts[$0].globalAlpha = 0.5;
            cp5.contexts[$0].drawImage(buffer, $2, $3)
        }, ctx, imgId, dx, dy, dw, dh, c.r, c.g, c.b);
    }

    virtual void DrawImage(Context *src, int32_t ctxId, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh) {
        if(ctxId == CTX_INVALID) return;
        
        dirty = true;
        EM_ASM_ARGS({
            cp5.contexts[$0].drawImage(cp5.contexts[$1].canvas, $2, $3, $4, $5, $6, $7, $8, $9);
        }, ctx, ctxId, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    virtual void DrawImage(Image *src, int32_t imgId, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh) {
        dirty = true;
        EM_ASM_ARGS({
            cp5.contexts[$0].drawImage(cp5.images[$1], $2, $3, $4, $5, $6, $7, $8, $9);
        }, ctx, imgId, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    virtual void FillText(const char *str, double x, double y) {
        dirty = true;
        EM_ASM_ARGS({
            cp5.contexts[$0].fillText(UTF8ToString($1), $2, $3);
        }, ctx, str, x, y);
    }

    virtual void StrokeText(const char *str, double x, double y) {
        dirty = true;
        EM_ASM_ARGS({
            cp5.contexts[$0].strokeText(UTF8ToString($1), $2, $3);
        }, ctx, str, x, y);
    }

    virtual double MeasureText(const char *str) {
        return EM_ASM_DOUBLE({
            return cp5.contexts[$0].measureText(UTF8ToString($1)).width;
        }, ctx, str);
    }

    virtual void SetFontSize(double px) {
        EM_ASM_ARGS({
            cp5.contexts[$0].font = ~~($1) + 'px "Exo 2"';
        }, ctx, px);
    }

    virtual void SetTextAlign(ctx_text_align v) {
        switch(v) {
            case CTX_TEXT_ALIGN_LEFT:   return (void) EM_ASM_ARGS({ cp5.contexts[$0].textAlign = "left"; }, ctx);
            case CTX_TEXT_ALIGN_CENTER: return (void) EM_ASM_ARGS({ cp5.contexts[$0].textAlign = "center"; }, ctx);
            case CTX_TEXT_ALIGN_RIGHT:  return (void) EM_ASM_ARGS({ cp5.contexts[$0].textAlign = "right"; }, ctx);
        }
    }

    virtual void SetLineCap(ctx_line_cap v) {
        switch(v) {
            case CTX_LINE_CAP_BUTT:   return (void) EM_ASM_ARGS({ cp5.contexts[$0].lineCap = "butt"; }, ctx);
            case CTX_LINE_CAP_ROUND:  return (void) EM_ASM_ARGS({ cp5.contexts[$0].lineCap = "round"; }, ctx);
            case CTX_LINE_CAP_SQUARE: return (void) EM_ASM_ARGS({ cp5.contexts[$0].lineCap = "square"; }, ctx);
        }
    }

    virtual void SetLineJoin(ctx_line_join v) {
        switch(v) {
            case CTX_LINE_JOIN_ROUND: return (void) EM_ASM_ARGS({ cp5.contexts[$0].lineJoin = "round"; }, ctx);
            case CTX_LINE_JOIN_BEVEL: return (void) EM_ASM_ARGS({ cp5.contexts[$0].lineJoin = "bevel"; }, ctx);
            case CTX_LINE_JOIN_MITER: return (void) EM_ASM_ARGS({ cp5.contexts[$0].lineJoin = "miter"; }, ctx);
        }
    }

    virtual void SetMiterLimit(double v) {
        EM_ASM_ARGS({
            cp5.contexts[$0].miterLimit = $1;
        }, ctx, v);
    }

    virtual void SetTextBaseline(ctx_text_baseline v) {
        switch(v) {
            case CTX_BASELINE_TOP:         return (void) EM_ASM_ARGS({ cp5.contexts[$0].textBaseline = "top"; }, ctx);
            case CTX_BASELINE_HANGING:     return (void) EM_ASM_ARGS({ cp5.contexts[$0].textBaseline = "hanging"; }, ctx);
            case CTX_BASELINE_MIDDLE:      return (void) EM_ASM_ARGS({ cp5.contexts[$0].textBaseline = "middle"; }, ctx);
            case CTX_BASELINE_ALPHABETIC:  return (void) EM_ASM_ARGS({ cp5.contexts[$0].textBaseline = "alphabetic"; }, ctx);
            case CTX_BASELINE_IDEOGRAPHIC: return (void) EM_ASM_ARGS({ cp5.contexts[$0].textBaseline = "ideographic"; }, ctx);
            case CTX_BASELINE_BOTTOM:      return (void) EM_ASM_ARGS({ cp5.contexts[$0].textBaseline = "bottom"; }, ctx);
        }
    }

    virtual void SetLineDash(double a, double b) {
        EM_ASM_ARGS({ cp5.contexts[$0].setLineDash([$1, $2]); }, ctx, a, b);
    }

    virtual void ClearLineDash() {
        EM_ASM_ARGS({ cp5.contexts[$0].setLineDash([]); }, ctx);
    }

    virtual void SetLineDashOffset(double v) {
        EM_ASM_ARGS({ cp5.contexts[$0].lineDashOffset = $1; }, ctx, v);
    }
        
    virtual void ShadowBlur(uint8_t val, uint8_t r, uint8_t g, uint8_t b) {
        EM_ASM_ARGS({
            cp5.contexts[$0].shadowBlur = $1;
            cp5.contexts[$0].shadowColor = 'rgb(' + $2 + ',' + $3 + ',' + $4 + ')';
            
        }, ctx, val, r, g, b);
    }

    static bool HaveFontsLoaded() {
        return EM_ASM_INT_V({
            if(!haveFontsLoaded) haveFontsLoaded = FontDetect.isFontLoaded("Exo 2");
            return haveFontsLoaded;
        });
    }

    virtual void GetPixelData(void* data) {
        int32_t width, height;
        GetSize(&width, &height);
        int result = EM_ASM_INT({
            if (cp5.contexts[$0] == null){
                console.log("Try to access a null context! - "+ $0);
                return 1;
            }
            var imageData = cp5.contexts[$0].getImageData(0, 0, $2, $3);
            var array = new Uint8Array(Module.HEAPU8.buffer, $1, $2*$3*4);
            array.set(new Uint8Array(imageData.data));
            return 0;
        }, ctx, data, width, height);
        if (result==0) {
            dirty = false;
        }
    }
    
    virtual void Reset() {
        EM_ASM_ARGS({
            //for (var i=0; i<10; i++) {
            //    cp5.contexts[$0].restore();
            //}
            cp5.contexts[$0].setTransform(1, 0, 0, 1, 0, 0);
            cp5.contexts[$0].clearRect(0, 0, cp5.contexts[$0].canvas.width, cp5.contexts[$0].canvas.height);
        }, ctx);
    }
    
    virtual void BeginFrame(int width, int height) {
    }
    
    virtual void EndFrame() {
    }
    
    virtual bool IsDirty() {
        return dirty;
    }
    
    virtual int CreatePattern(Image* src, int32_t imgId) {
        int i = EM_ASM_INT({
            var pattern = cp5.contexts[$0].createPattern(cp5.images[$1], 'repeat');
            
            for(var i = 0; i < cp5.patterns.length; ++i){
                if(cp5.patterns[i] == null){
                    cp5.patterns[i] = pattern;
                    return i;
                }
            }
            
            cp5.patterns.push(pattern);
            return cp5.patterns.length - 1;
        }, ctx, imgId);
        return i;
    }
    
    virtual int CreatePattern(Context* src, int32_t ctxId) {
        int i = EM_ASM_INT({
            var pattern = cp5.contexts[$0].createPattern(cp5.contexts[$1].canvas, null);
            
            for(var i = 0; i < cp5.patterns.length; ++i){
                if(cp5.patterns[i] == null){
                    cp5.patterns[i] = pattern;
                    return i;
                }
            }
            
            cp5.patterns.push(pattern);
            return cp5.patterns.length - 1;
        }, ctx, ctxId);
        return i;
    }
    
    virtual void FillPattern(int id, double x, double y, double w, double h) {
        this->Save();
        Translate(x, y);
        EM_ASM_ARGS({
            cp5.contexts[$0].fillStyle = cp5.patterns[$1];
            cp5.contexts[$0].fillRect(0, 0, $2, $3);
        }, ctx, id, w, h);
        this->Restore();
    }
    
    virtual void FillStylePattern(int id) {
        EM_ASM_ARGS({
            cp5.contexts[$0].fillStyle = cp5.patterns[$1];
        }, ctx, id);
    }
    
    virtual int32_t GetId() {
        return ctx;
    }
};
