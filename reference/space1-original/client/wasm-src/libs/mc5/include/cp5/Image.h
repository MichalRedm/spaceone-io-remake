#ifndef IMAGE__H
#define IMAGE__H
#pragma once

#include "Interface.h"

namespace cp5 {
	
extern size_t num_images;

class Context;
class Image {
public:
	
	Image(const char *src);
	~Image();
	
	bool HasLoaded() const {
		if(!hasLoaded) GetInfo();
		return hasLoaded;
	}
	
	int32_t Width() const {
		if(!hasLoaded) GetInfo();
		return width;
	}
	
	int32_t Height() const {
		if(!hasLoaded) GetInfo();
		return height;
	}
	
private:
	void GetInfo() const;
	
	int32_t img;
	mutable bool hasLoaded = false;
	mutable int32_t width = 0; 
	mutable int32_t height = 0;
	
	friend Context;
};
}

#endif