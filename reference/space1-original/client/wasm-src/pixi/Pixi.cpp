#include "Pixi.h"

void Pixi::Init(){
#ifdef EMSCRIPTEN
	EM_ASM({
		var type = "WebGL";
		if(!PIXI.utils.isWebGLSupported()){
			type = "canvas"
		}

		var atlas = "../img/atlas/image_atlas.json";

		PIXI.utils.sayHello(type);

		pixi.loader = PIXI.loader;

		//Create the renderer
		pixi.renderer = PIXI.autoDetectRenderer(window.innerWidth, window.innerHeight, {transparent: true});

		pixi.renderer.view.style.position = "absolute";
		pixi.renderer.view.style.display = "block";
		pixi.renderer.autoResize = true;
		pixi.renderer.resize(window.innerWidth, window.innerHeight);

		pixi.graphics = new PIXI.Graphics();

		//Add the canvas to the HTML document
		document.body.appendChild(pixi.renderer.view);

		//Create a container object called the `stage`
		pixi.stage = new PIXI.Container();
	});
#endif
}

void Pixi::Destroy(){
	
}

void Pixi::SetSize(int32_t width, int32_t height){
	/*EM_ASM_ARGS({

	}, width, height);*/
}

void Pixi::DrawImage(std::string& imageName, double dx, double dy) {	
	/*EM_ASM_ARGS({
		
	}, imageName, dx, dy);*/
}

int Pixi::FillRect(double x, double y, double w, double h)
{
#ifdef EMSCRIPTEN
	return EM_ASM_INT({
		var viewportX = pixi.camera.x - window.innerWidth / 2;
		var viewportY = pixi.camera.y - window.innerHeight / 2;

		var realX = $0 - viewportX;
		var realY = $1 - viewportY;

		/*var leftBoundary = Math.abs($0) - Math.abs(viewportX) > 0;
		var rightBoundary = Math.abs($0) + Math.abs(viewportX) < $2;
		var topBoundary = Math.abs($1) - Math.abs(viewportY) > 0;
		var bottomBoundary = Math.abs($1) + Math.abs(viewportY) < $3;

		if(leftBoundary && rightBoundary && topBoundary && bottomBoundary)
		{

		}*/
		var rectangle = new PIXI.Graphics();
		rectangle.beginFill(0x66CCFF);
		rectangle.lineStyle(4, 0xFF3300, 1);
		rectangle.drawRect(realX, realY, $2, $3);
		rectangle.endFill();
		pixi.stage.addChild(rectangle);

		//STORAGE
		for(var i = 0; i < pixi.elements.length; i++)
		{
			if(pixi.elements[i] != null) continue;
			pixi.elements[i] = rectangle;
			return i;
		}

		pixi.elements.push(rectangle);
		return pixi.elements.length - 1;
	}, x, y, w, h);
#else
    return 0;
#endif
}

void Pixi::Background(double x, double y, double w, double h)
{
#ifdef EMSCRIPTEN
	EM_ASM_ARGS({
		pixi.loader
			.add("../../public/img/BG_Stars.png")
			.load(setup);

		function setup()
		{
			var bg = new PIXI.Sprite(pixi.loader.resources["../../public/img/BG_Stars.png"].texture);
			var rectangle = new Rectangle($0, $1, $2, $3);
			//Tell the texture to use that rectangular section
			bg.frame = rectangle;

			//Add the rocket to the stage
			stage.addChild(bg);
		}
	}, x, y, w, h);
#endif
}

void Pixi::UpdateRectElement(int rectID, double x, double y, double w, double h)
{
#ifdef EMSCRIPTEN
	EM_ASM_ARGS({
		var rect = pixi.elements[$0];
		if(rect == null)
		{
			console.error('RECT IS NULL');
			return;
		}

		console.info('Updating Rect with ID: '+ $0);

		rect.x = $1;
		rect.y = $2;
		rect.width = $3;
		rect.height = $4;
	}, rectID, x, y, w, h);
#endif
}

void Pixi::CreateText(int fontSize, const char* text, double x, double y)
{
#ifdef EMSCRIPTEN
	EM_ASM_ARGS({
		var text = UTF8ToString($1);
		var message = new PIXI.Text(
			text,
			{fontFamily: "Exo 2", fontSize: $0, fill: "white"}
		);

		message.position.set($2, $3);
		pixi.stage.addChild(message);

	}, fontSize, text, x, y);
#endif
}

void Pixi::Render()
{
#ifdef EMSCRIPTEN
	EM_ASM({
		pixi.renderer.render(pixi.stage);
	});
#endif
}

void Pixi::TranslateStage(double x, double y)
{
#ifdef EMSCRIPTEN
	EM_ASM_ARGS({
		pixi.stage.x = $0;
		pixi.stage.y = $1;
	}, x, y);
#endif
}

void Pixi::SetStagePosition(double x, double y)
{
#ifdef EMSCRIPTEN
	EM_ASM_ARGS({
		pixi.camera.x = $0;
		pixi.camera.y = $1;
	}, x, y);
#endif
}
