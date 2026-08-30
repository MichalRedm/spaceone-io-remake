#include <cp5/Text.h>

namespace cp5 {
	
Context* Text::Render(){
	if(dirty && Context::HaveFontsLoaded()){
		dirty = false;
		
		if(!hasContext){
			hasContext = true;
			ctx.Init();
		}
		
		ctx.SetFontSize(size);
		double margin = strokeSize * size * 2;
		int vmargin = int(size * 0.4);
		
		m_iWidth = (ctx.MeasureText(value) + margin * 2) * scale;
		m_iHeight = (size + vmargin) * scale;
		ctx.SetSize(m_iWidth, m_iHeight);
		
		ctx.SetTextBaseline(CTX_BASELINE_MIDDLE);
		ctx.SetFontSize(size * scale);
		ctx.SetAlpha(1.0);
		ctx.SetLineWidth(size * strokeSize * scale);
		ctx.StrokeColor(strokeColor);
		ctx.FillColor(fillColor);
		
		int tx = margin * scale;
		int ty = m_iHeight / 2;
		if(stroke) ctx.StrokeText(value, tx, ty);
		ctx.FillText(value, tx, ty);
	}
	
	return &ctx;
}

void Text::Render(Context *ctx, float x, float y){
	ctx->DrawImage(Render(), x, y);
}

void Text::RenderCentered(Context *ctx, float x, float y){
	Render(ctx, x - Width() / 2, y - Height() / 2);
}

void Text::RenderVerticallyCentered(Context *ctx, float x, float y){
	Render(ctx, x, y - Height() / 2);
}


}
