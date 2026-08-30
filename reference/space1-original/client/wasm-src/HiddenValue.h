#ifndef HIDDENVALUE__H
#define HIDDENVALUE__H

template<typename T>
class HiddenValue {
	typedef HiddenValue<T> ThisClass;
	
public:
	static_assert(std::is_trivial<T>::value, "Cannot hide non-trivial values");
	
	HiddenValue(const T& v = T()){
		Set(v);
	}
	
	HiddenValue(const ThisClass &other){
		Set(other.Get());
	}
	
	ALWAYS_INLINE inline ThisClass& operator=(const T& v){
		Set(v);
		return *this;
	}
	
	ALWAYS_INLINE inline ThisClass& operator=(const ThisClass& other){
		Set(other.Get());
		return *this;
	}
	
	ALWAYS_INLINE T Get() const {
		char bytes[sizeof(T)];
		memcpy(bytes, m_pData.get(), sizeof(T));
		Xor(bytes);
		
		T v = *reinterpret_cast<T*>(bytes);
		Set(v);
		return v;
	}
	
	ALWAYS_INLINE operator T() const { return Get(); }
	
	inline ThisClass& operator+=(const T& v){ Set(Get() + v); return *this; }
	inline ThisClass& operator-=(const T& v){ Set(Get() - v); return *this; }
	inline ThisClass& operator*=(const T& v){ Set(Get() * v); return *this; }
	inline ThisClass& operator/=(const T& v){ Set(Get() / v); return *this; }
	
private:
	ALWAYS_INLINE void Set(const T& v) const {
		m_pData.reset(new char[sizeof(T)]);
		
		char *bytes = m_pData.get();
		memcpy(bytes, &v, sizeof(v));
		
		m_iSeed = 13 * m_iSeed + 1;
		Xor(bytes);
	}
	
	ALWAYS_INLINE void Xor(char *bytes) const {
		uint8_t seed = m_iSeed;
		for(size_t i = 0; i < sizeof(T); ++i){
			bytes[i] ^= seed;
			seed = 27 * seed + 1;
		}
	}
	
	mutable uint8_t m_iSeed = 0x28;
	mutable std::unique_ptr<char[]> m_pData;
};

#endif
