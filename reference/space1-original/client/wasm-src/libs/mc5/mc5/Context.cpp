#include <cp5/Context.h>
#include <map>
#include <vector>

#ifdef TARGET_OS_IPHONE
#undef TARGET_OS_MAC
#endif

#ifdef __MAC__
#define TARGET_OS_MAC
#endif

#ifdef TARGET_OS_MAC
#include <OpenGL/gl.h>
#define NANOVG_GL2_IMPLEMENTATION
#else
#include <GLES2/gl2.h>
#define NANOVG_GLES2_IMPLEMENTATION
#endif

#include "nanovg/nanovg.h"
#include "nanovg/nanovg_gl.h"
#include "nanovg/nanovg_gl_utils.h"

#undef glViewport
extern "C" void glViewport(GLint x, GLint y, GLsizei width, GLsizei height);

void CleanupNativeContexts();

#ifdef EMSCRIPTEN
#include <emscripten/html5.h>
#endif

#define NATIVE_CONTEXT_DRAW_START {if (frameBuffer!=NULL) frameBufferRendered=false;}
#define NATIVE_CONTEXT_DRAW_END /**/
#define NATIVE_CONTEXT_FRAMEBUFFER_SIZE 512

extern int DEVICE_SCREEN_WIDTH;
extern int DEVICE_SCREEN_HEIGHT;

#include "MCImageProcessing/MCImageProcessing.h"

static MCTextRendererProperties* CreateTextProperties(const char* str, MCTextRendererTypes::Font font, float fontSize, MCTextRendererTypes::HorizontalAlignment horizontalAlignment) {
    std::string stdstring = std::string(str);
    MCTextRendererTypes::Color fontColor = MCTextRendererColorFromRGBAf(1.0f, 1.0f, 1.0f, 1.0f);
    MCTextRendererTypes::Color outlineColor = MCTextRendererColorFromRGBAf(1.0f, 1.0f, 1.0f, 0.0f);
    MCTextRendererTypes::VerticalAlignment verticalAlignment = MCTextRendererTypes::VerticalAlignment::VerticalAlignmentBottom;
    MCTextRendererTypes::LineBreakMode lineBreakMode = MCTextRendererTypes::LineBreakMode::LineBreakModeClipping;
    MCTextRendererProperties* properties = new MCTextRendererProperties(&stdstring, &font, fontSize, fontColor, horizontalAlignment, lineBreakMode);
    properties->setPixelFormat(MCTextRendererTypes::PixelFormat::PixelFormat_8888);
    properties->setOutlineWidth(0.0f);
    properties->setVerticalAlignment(verticalAlignment);
    properties->setOutlineColor(outlineColor);
    return properties;
}

static std::map<std::string, MCTextRendererTypes::Font>* registeredFonts = NULL;
static std::map<std::string, MCTextRendererTypes::Font>* getRegisteredFonts() {
    if (registeredFonts == NULL)
        registeredFonts = new std::map<std::string, MCTextRendererTypes::Font>();
    return registeredFonts;
}

MCTextRendererTypes::Font GET_FONT_NAME(std::string fontName) {
    std::map<std::string, MCTextRendererTypes::Font>* fonts = getRegisteredFonts();
    MCTextRendererTypes::Font font;
    auto found = fonts->find(fontName);
    if (found == fonts->end()) {
        FILE *fp = fopen(fontName.c_str(), "rb");
        if (fp==NULL)
            abort();
        
        fseek(fp, 0, SEEK_END);
        int size = ftell(fp);
        fseek(fp, 0, SEEK_SET);
        
        if (size==0)
            abort();
        
        void *data = (void*)malloc(size);
        
        unsigned int len = fread(data, 1, size, fp);
        fclose(fp);
        
        font = MCTEXTRENDERER_SHARED->registerFont(data, len);
    }
    else {
        font = found->second;
    }
    return font;
}

extern GLuint GetTextureIdForImageId(int32_t imgId, bool repeat);
extern cp5::Image* GetImageForName(const char* name);

using namespace cp5;

struct NVGcontext* sMainContext = NULL;

static GLint sDefaultViewport[4];
static bool sDefaultViewportSet = false;

class EmptyContext;
static std::map<int, EmptyContext*>* sContexts = NULL;
static std::map<std::string, Context*>* sContextIds = NULL;
static std::vector<EmptyContext*>* sContextsToDelete = NULL;
static std::vector<EmptyContext*>* sContextsToReuse = NULL;

static std::map<std::string, AtlasFrame*>* sAtlasFrames = NULL;

#include "EmptyContext.h"
#include "NativeContext.h"
#include "WebContext.h"

void ContextInit();
void ContextInit() {
    if (sContexts==NULL)
        sContexts = new std::map<int, EmptyContext*>();
    if (sContextsToDelete==NULL)
        sContextsToDelete = new std::vector<EmptyContext*>();
    if (sContextsToReuse==NULL)
        sContextsToReuse = new std::vector<EmptyContext*>();
}

#ifndef EMSCRIPTEN
void ContextCreateMain();
void ContextCreateMain() {
    if (sContextIds==NULL) {
        sContextIds = new std::map<std::string, Context*>();
        Context* context = new cp5::Context();
        context->SetSize(DEVICE_SCREEN_WIDTH, DEVICE_SCREEN_HEIGHT);
        sContextIds->insert({"canvas", context});
    }
}
#endif

void CleanupNativeContexts() {
    sContextsToReuse->insert(sContextsToReuse->end(), sContextsToDelete->begin(), sContextsToDelete->end());
    sContextsToDelete->clear();
}

EmptyContext* GetEmptyContext();
EmptyContext* GetEmptyContext() {
    if (sContextsToReuse->size()>0) {
        EmptyContext* nativeContext = sContextsToReuse->back();
        sContextsToReuse->pop_back();
        nativeContext->Reset();
        return nativeContext;
    }
    return NULL;
}

namespace cp5 {

size_t num_contexts = 0;

CanvasPattern::~CanvasPattern(){
#ifdef __EMSCRIPTEN__
    EM_ASM_({
        cp5.patterns[$0] = null;
    }, id);
#endif
}

void Context::Init(){
    ContextInit();
    Destroy();
    EmptyContext* nativeContext = GetEmptyContext();
    if (nativeContext==NULL) {
#ifdef EMSCRIPTEN
        ctx = EM_ASM_INT_V({
            var ctx = document.createElement('canvas').getContext('2d');
            
            for(var i = 0; i < cp5.contexts.length; ++i){
                if(cp5.contexts[i] != null) continue;
                cp5.contexts[i] = ctx;
                return i;
            }
            cp5.contexts.push(ctx);
            
            return cp5.contexts.length - 1;
        });
        nativeContext = new WebContext(ctx);
#else
        nativeContext = new NativeContext();
#endif
    }
    ctx = nativeContext->GetId();
    sContexts->insert({ctx, nativeContext});
    ++num_contexts;
}

void Context::Destroy(){
	if(ctx == CTX_INVALID) return;
	
    auto it = sContexts->find(ctx);
    if (it!=sContexts->end()) {
        EmptyContext* nativeContext = it->second;
        sContexts->erase(it);
        sContextsToDelete->push_back(nativeContext);
    }

    --num_contexts;
	ctx = CTX_INVALID;
}

void Context::SetSize(int32_t width, int32_t height){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetSize(width, height);
}

void Context::GetSize(int32_t *width, int32_t *height) const {
#ifdef EMSCRIPTEN
    EM_ASM_ARGS({
        var canvas = cp5.contexts[$0].canvas;
        HEAP32[$1 >> 2] = canvas.width;
        HEAP32[$2 >> 2] = canvas.height;
    }, ctx, width, height);
#else
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->GetSize(width, height);
#endif
}

void Context::Save(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Save();
}

void Context::Restore(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Restore();
}

void Context::Fill(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Fill();
}

void Context::Stroke(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Stroke();
}

void Context::StrokeWidth(uint32_t width = 1){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->StrokeWidth(width);
}

void Context::Clip(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Clip();
}

void Context::BeginPath(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->BeginPath();
}

void Context::ClosePath(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->ClosePath();
}

void Context::Rect(double x, double y, double w, double h){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Rect(x, y, w, h);
}

void Context::ClearRect(double x, double y, double w, double h){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->ClearRect(x, y, w, h);
}

void Context::FillRect(double x, double y, double w, double h){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->FillRect(x, y, w, h);
}

void Context::FillColor(const Color &c){
    FillColor(c.r, c.g, c.b);
}

void Context::FillColor(uint8_t r, uint8_t g, uint8_t b){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->FillColor(r, g, b);
}

int Context::CreateRadialGradient(double xStart, double yStart, double radiusStart, double xEnd, double yEnd, double radiusEnd)
{
    EmptyContext* nativeContext = sContexts->at(ctx);
    return nativeContext->CreateRadialGradient(xStart, yStart, radiusStart, xEnd, yEnd, radiusEnd);
}

int Context::CreateLinearGradient(double x0, double y0, double x1, double y1)
{
    EmptyContext* nativeContext = sContexts->at(ctx);
    return nativeContext->CreateLinearGradient(x0, y0, x1, y1);
}

void Context::SetGlobalCompositeOperation(const char* compositeOperation)
{
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetGlobalCompositeOperation(compositeOperation);
}

void Context::FillStyle(const char* fillStyle)
{
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->FillStyle(fillStyle);
}

void Context::SetFillStyleFromGradient(int gradientID)
{
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetFillStyleFromGradient(gradientID);
}

void Context::SetStrokeStyleFromGradient(int gradientID)
{
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetStrokeStyleFromGradient(gradientID);
}

void Context::GradientAddColorStop(int gradientID, double offset, const Color& color)
{
	GradientAddColorStop(gradientID, offset, color.r, color.g, color.b, color.a);
}

void Context::GradientAddColorStop(int gradientID, double offset, uint8_t r, uint8_t g, uint8_t b, double a)
{
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->GradientAddColorStop(gradientID, offset, r, g, b, a);
}

/*void Context::GradientAddColorStop(int gradientID, double offset, const char *color)
{
	EM_ASM_ARGS({
		cp5.gradients[$0].addColorStop($1, UTF8ToString($2));
	}, gradientID, offset, color);
}*/

void Context::StrokeColor(const Color &c){
    StrokeColor(c.r, c.g, c.b);
}

void Context::StrokeColor(uint8_t r, uint8_t g, uint8_t b){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->StrokeColor(r, g, b);
}

void Context::SetAlpha(double v){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetAlpha(v);
}

double Context::GetAlpha()
{
    EmptyContext* nativeContext = sContexts->at(ctx);
    return nativeContext->GetAlpha();
}

void Context::MoveTo(double x, double y){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->MoveTo(x, y);
}

void Context::LineTo(double x, double y){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->LineTo(x, y);
}

void Context::Arc(double x, double y, double radius, double startAngle, double endAngle, bool anticlockwise){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Arc(x, y, radius, startAngle, endAngle, anticlockwise);
}

void Context::Scale(double x, double y){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Scale(x, y);
}

void Context::Rotate(double v){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Rotate(v);
}

void Context::Translate(double x, double y){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->Translate(x, y);
}

void Context::SetLineWidth(double v){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetLineWidth(v);
}

// Note: Code bellow that contains #ifdef EMSCRIPTEN corresponds to unimplemented functionality

double Context::GetImageWidth(AtlasFrame* frame) {
    if (!frame->loaded)
        GetAtlasFrame(frame->name.c_str());
    return frame->w;
}
    
double Context::GetImageHeight(AtlasFrame* frame) {
    if (!frame->loaded)
        GetAtlasFrame(frame->name.c_str());
    return frame->h;
}
    
void Context::DrawImageWithTint(Image *src, const Color &c, double dx, double dy, double dw, double dh){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->DrawImageWithTint(src, src->img, c, dx, dy, dw, dh);
}

//void Context::DrawImageFromAtlas(Context *src, const char *str, double dx, double dy) {
void Context::DrawImageFromAtlas(AtlasFrame* frame, double dx, double dy, double dw, double dh) {
    if (!frame->loaded)
        GetAtlasFrame(frame->name.c_str());
    if (!frame->loaded)
        return;
    DrawImage(frame->image, frame->x, frame->y, frame->w, frame->h, dx, dy, dw, dh);
}

void Context::DrawImage(Context *src, double dx, double dy) {
	if(src->ctx == CTX_INVALID) return;
	
    int32_t width = 0;
    int32_t height = 0;
    src->GetSize(&width, &height);
    DrawImage(src, dx, dy, width, height);
}

void Context::DrawImage(Context *src, double dx, double dy, double dw, double dh) {
	if(src->ctx == CTX_INVALID) return;
	
    int32_t width = 0;
    int32_t height = 0;
    src->GetSize(&width, &height);
    DrawImage(src, 0, 0, width, height, dx, dy, dw, dh);
}

void Context::DrawImage(Context *src, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh) {
	if(src->ctx == CTX_INVALID) return;
	
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->DrawImage(src, src->ctx, sx, sy, sw, sh, dx, dy, dw, dh);
}

void Context::DrawImage(Image *src, double dx, double dy) {
    int32_t width = src->Width();
    int32_t height = src->Height();
    DrawImage(src, dx, dy, width, height);
}

void Context::DrawImage(Image *src, double dx, double dy, double dw, double dh) {
    int32_t width = src->Width();
    int32_t height = src->Height();
    DrawImage(src, 0, 0, width, height, dx, dy, dw, dh);
}

void Context::DrawImage(Image *src, double sx, double sy, double sw, double sh, double dx, double dy, double dw, double dh) {
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->DrawImage(src, src->img, sx, sy, sw, sh, dx, dy, dw, dh);
}

void Context::FillText(const char *str, double x, double y){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->FillText(str, x, y);
}

void Context::StrokeText(const char *str, double x, double y){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->StrokeText(str, x, y);
}

double Context::MeasureText(const char *str){
    EmptyContext* nativeContext = sContexts->at(ctx);
    return nativeContext->MeasureText(str);
}

void Context::SetFontSize(double px){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetFontSize(px);
}

void Context::SetTextAlign(ctx_text_align v){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetTextAlign(v);
}

void Context::SetLineCap(ctx_line_cap v) {
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetLineCap(v);
}

void Context::SetLineJoin(ctx_line_join v) {
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetLineJoin(v);
}

void Context::SetMiterLimit(double v){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetMiterLimit(v);
}

void Context::SetTextBaseline(ctx_text_baseline v){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetTextBaseline(v);
}

void Context::SetLineDash(double a, double b){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetLineDash(a, b);
}

void Context::ClearLineDash(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->ClearLineDash();
}

void Context::SetLineDashOffset(double v){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->SetLineDashOffset(v);
}

void Context::ShadowBlur(uint8_t val, const Color& c){
    ShadowBlur(val, c.r, c.g, c.b);
}
    
void Context::ShadowBlur(uint8_t val, uint8_t r, uint8_t g, uint8_t b){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->ShadowBlur(val, r, g, b);
}

void Context::BeginFrame(int width, int height){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->BeginFrame(width, height);
}

void Context::EndFrame(){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->EndFrame();
    CleanupNativeContexts();
}

void Context::AddAtlas(const char* name, const char* atlasPath, const char* imagePath) {
#ifdef EMSCRIPTEN
    EM_ASM_ARGS({
        function createImage(imageSrc) {
            var img = new Image();
            img.src = imageSrc;
            
            for(var i = 0; i < cp5.images.length; ++i){
                if(cp5.images[i] != null) continue;
                cp5.images[i] = img;
                return i;
            }
            
            cp5.images.push(img);
            return cp5.images.length - 1;
            
            cp5.num_images++;
        }
        
        $.getJSON(UTF8ToString($1), function(data) {
            cp5.spritesheetsNames[UTF8ToString($0)] = data;
            cp5.spritesheetsImages[UTF8ToString($0)] = createImage(UTF8ToString($2));
        });
    }, name, atlasPath, imagePath);
#endif
}

AtlasFrame* Context::GetAtlasFrame(const char* imageName) {
    if (sAtlasFrames==NULL)
        sAtlasFrames = new std::map<std::string, AtlasFrame*>();
    
    auto it = sAtlasFrames->find(imageName);
    if (it!=sAtlasFrames->end() && it->second->loaded)
        return it->second;
    
    char atlasImage[200];
    int32_t x, y, w, h;
    int success = EM_ASM_INT({
        var imagePath = UTF8ToString($0);
        var imagePathComponents = imagePath.split("/");
        var spritesheetName = imagePathComponents[0];
        var imageName = imagePathComponents[1];
        
        if (!(spritesheetName in cp5.spritesheetsNames)) {
            return 0;
        }
        
        var imageCoordinates = cp5.spritesheetsNames[spritesheetName].frames[imageName].frame;
        
        var x = imageCoordinates.x;
        var y = imageCoordinates.y;
        var w = imageCoordinates.w;
        var h = imageCoordinates.h;
        
        HEAP32[$2 >> 2] = x;
        HEAP32[$3 >> 2] = y;
        HEAP32[$4 >> 2] = w;
        HEAP32[$5 >> 2] = h;
        
        var imageName = cp5.images[cp5.spritesheetsImages[spritesheetName]].src;
        stringToUTF8(imageName, $1, 200);
        
        return 1;
    }, imageName, atlasImage, &x, &y, &w, &h);
    
    if (it==sAtlasFrames->end()) {
        AtlasFrame* frame = new AtlasFrame;
        sAtlasFrames->emplace(imageName, frame);
    }
    AtlasFrame* frame = sAtlasFrames->find(imageName)->second;
    
    if (success) {
        frame->name = imageName;
        frame->image = GetImageForName(atlasImage);
        frame->x = x;
        frame->y = y;
        frame->w = w;
        frame->h = h;
        frame->loaded = true;
    } else {
        frame->name = imageName;
        frame->image = NULL;
        frame->x = 0;
        frame->y = 0;
        frame->w = 0;
        frame->h = 0;
        frame->loaded = false;
    }
    
    return frame;
}

Context *Context::FromCanvas(const char *id){
#ifdef EMSCRIPTEN
    if (EM_ASM_INT_V({if (cp5.defaultToWebGL) return 1; return 0;})==0)
    {
    ContextInit();
    Context* context = new Context(EM_ASM_INT({
        var elem = document.getElementById(UTF8ToString($0));
        if(elem == null) return -1;
        
        var ctx = elem.getContext('2d');
        
        for(var i = 0; i < cp5.contexts.length; ++i) {
            if(cp5.contexts[i] != null) continue;
            cp5.contexts[i] = ctx;
            return i;
        }
        
        cp5.contexts.push(ctx);
        return cp5.contexts.length - 1;
    }, id));
    EmptyContext* nativeContext = new WebContext(context->ctx);
    sContexts->insert({context->ctx, nativeContext});
    return context;
    
    } else {
    
    ContextInit();
	Context* context = new Context(EM_ASM_INT({
		var elem = document.getElementById(UTF8ToString($0));
		if(elem == null) return -1;
		
		var ctx = elem.getContext('webgl');
		
		for(var i = 0; i < cp5.contexts.length; ++i){
			if(cp5.contexts[i] != null) continue;
			cp5.contexts[i] = ctx;
			return i;
		}
		
		cp5.contexts.push(ctx);
		return cp5.contexts.length - 1;
	}, id));
    
    EmscriptenWebGLContextAttributes attrs;
    emscripten_webgl_init_context_attributes(&attrs);
    //attrs.depth = 1;
    //attrs.stencil = 1;
    //attrs.antialias = 1;
    //attrs.majorVersion=1;
    //attrs.minorVersion=0;
    assert(emscripten_webgl_get_current_context() == 0);
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE c = emscripten_webgl_create_context(id, &attrs);
    assert(c > 0); // Must have received a valid context.
    EMSCRIPTEN_RESULT res = emscripten_webgl_make_context_current(c);
    assert(res == EMSCRIPTEN_RESULT_SUCCESS);
    assert(emscripten_webgl_get_current_context() == c);
    
    EmptyContext* nativeContext = new NativeContext();
    sContexts->insert({context->ctx, nativeContext});
    int32_t width, height;
    EM_ASM_ARGS({
        var canvas = cp5.contexts[$0].canvas;
        HEAP32[$1 >> 2] = canvas.width;
        HEAP32[$2 >> 2] = canvas.height;
    }, context->ctx, &width, &height);
    context->SetSize(width, height);
    return context;
    }
#else
    ContextCreateMain();
    return sContextIds->at(id);
#endif
}

bool Context::HaveFontsLoaded(){
#ifdef EMSCRIPTEN
    return WebContext::HaveFontsLoaded();
#else
    return NativeContext::HaveFontsLoaded();
#endif
}

std::shared_ptr<CanvasPattern> Context::CreatePattern(Image* image){
    EmptyContext* nativeContext = sContexts->at(ctx);
    return std::shared_ptr<CanvasPattern>(new CanvasPattern(nativeContext->CreatePattern(image, image->img)));
}

std::shared_ptr<CanvasPattern> Context::CreatePattern(Context *from){
    EmptyContext* nativeContext = sContexts->at(ctx);
    return std::shared_ptr<CanvasPattern>(new CanvasPattern(nativeContext->CreatePattern(from, from->ctx)));
}

void Context::FillPattern(const std::shared_ptr<CanvasPattern> &pattern, double x, double y, double w, double h){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->FillPattern(pattern->id, x, y, w, h);
}

void Context::FillStylePattern(const std::shared_ptr<CanvasPattern> &pattern){
    EmptyContext* nativeContext = sContexts->at(ctx);
    nativeContext->FillStylePattern(pattern->id);
}

}
