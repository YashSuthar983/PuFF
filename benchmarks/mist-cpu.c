#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
static double ms(){struct timespec t;clock_gettime(CLOCK_MONOTONIC,&t);return t.tv_sec*1000.+t.tv_nsec/1e6;}
static char* readfile(const char*p){FILE*f=fopen(p,"rb");if(!f)exit(2);fseek(f,0,SEEK_END);long n=ftell(f);rewind(f);char*s=calloc(n+1,1);fread(s,1,n,f);fclose(f);return s;}
static GLuint shader(GLenum type,const char*path){const char*s=readfile(path);GLuint id=glCreateShader(type);glShaderSource(id,1,&s,0);glCompileShader(id);int ok;glGetShaderiv(id,GL_COMPILE_STATUS,&ok);if(!ok){char log[8192];glGetShaderInfoLog(id,8192,0,log);fprintf(stderr,"%s",log);exit(2);}free((void*)s);return id;}
static GLuint program(const char*v,const char*f){GLuint p=glCreateProgram(),vs=shader(GL_VERTEX_SHADER,v),fs=shader(GL_FRAGMENT_SHADER,f);glAttachShader(p,vs);glAttachShader(p,fs);glLinkProgram(p);glDeleteShader(vs);glDeleteShader(fs);int ok;glGetProgramiv(p,GL_LINK_STATUS,&ok);if(!ok)exit(3);return p;}
#define U(name) glGetUniformLocation(p,name)
#define F(name,value) glUniform1f(U(name),value)
static void draw(GLuint p,int w,int h,int steps,int stride){
 glUseProgram(p);glViewport(0,0,w,h);glUniform2f(U("uResolution"),w,h);F("uTime",3);F("uCoverage",.8);F("uAmbient",.95);F("uExposure",1.8);F("uSteps",steps);F("uShadowStride",stride);F("uDensityScale",1.3);F("uNoiseScale",1.05);F("uSoftness",.24);F("uErosion",.16);F("uExtinction",2.2);F("uShadowStrength",2.4);F("uLightIntensity",1);F("uLightFalloff",.22);F("uViewScale",3.4);F("uVolumeDepth",3.2);F("uShapeRadius",1.8);F("uDetail",.4);F("uBackgroundOpacity",0);glUniform3f(U("uCloudColor"),.91,.925,.921);glUniform3f(U("uWindDirection"),.06,.012,.01);glUniform3f(U("uLightDirection"),-.3,.5,.35);glUniform3f(U("uScale"),1,1,1);glUniform1i(U("uField"),0);glUniform1i(U("uHasField"),0);glUniform1i(U("uBoltCount"),0);glUniform1i(U("uPreset"),0);glUniform1i(U("uShape"),0);
 float positions[]={-2.5,-.68,.25,3.3,0,0,0,0,0,0,0,0},colors[]={.24,1,.23,0,0,0,0,0,0},radii[]={.45,1,1};glUniform4fv(U("uLights[0]"),3,positions);glUniform3fv(U("uLightColors[0]"),3,colors);glUniform1fv(U("uLightRadii[0]"),3,radii);glDrawArrays(GL_TRIANGLES,0,3);
}
static int cmp(const void*a,const void*b){double x=*(double*)a,y=*(double*)b;return(x>y)-(x<y);}
int main(int argc,char**argv){if(argc!=4)return 2;EGLDisplay d=eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA,EGL_DEFAULT_DISPLAY,0);if(!eglInitialize(d,0,0))return 77;eglBindAPI(EGL_OPENGL_ES_API);EGLint a[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES3_BIT,EGL_RED_SIZE,8,EGL_GREEN_SIZE,8,EGL_BLUE_SIZE,8,EGL_ALPHA_SIZE,8,EGL_NONE};EGLConfig c;int n;eglChooseConfig(d,a,&c,1,&n);if(!n)return 77;EGLint sa[]={EGL_WIDTH,1280,EGL_HEIGHT,720,EGL_NONE},ca[]={EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};EGLSurface s=eglCreatePbufferSurface(d,c,sa);EGLContext x=eglCreateContext(d,c,EGL_NO_CONTEXT,ca);if(!eglMakeCurrent(d,s,s,x))return 77;
 GLuint p[2]={program(argv[1],argv[2]),program(argv[1],argv[3])};GLuint vao,b;glGenVertexArrays(1,&vao);glBindVertexArray(vao);float triangle[]={-1,-1,3,-1,-1,3};glGenBuffers(1,&b);glBindBuffer(GL_ARRAY_BUFFER,b);glBufferData(GL_ARRAY_BUFFER,sizeof(triangle),triangle,GL_STATIC_DRAW);for(int i=0;i<2;i++){glUseProgram(p[i]);int loc=glGetAttribLocation(p[i],"aPosition");glEnableVertexAttribArray(loc);glVertexAttribPointer(loc,2,GL_FLOAT,0,0,0);}
 GLuint tex;glGenTextures(1,&tex);glBindTexture(GL_TEXTURE_3D,tex);unsigned char zero=0;glTexImage3D(GL_TEXTURE_3D,0,GL_R8,1,1,1,0,GL_RED,GL_UNSIGNED_BYTE,&zero);glTexParameteri(GL_TEXTURE_3D,GL_TEXTURE_MIN_FILTER,GL_LINEAR);glTexParameteri(GL_TEXTURE_3D,GL_TEXTURE_MAG_FILTER,GL_LINEAR);
 printf("{\"renderer\":\"%s\",\"backend\":\"surfaceless EGL/GLES3\",\"llvmpipeThreads\":1,\"samples\":20,\"cases\":[",glGetString(GL_RENDERER));
 const char*names[]={"previous-two-layer-mist","balanced-two-layer-mist","power-saver-one-layer-mist"};int widths[]={1280,720,480},heights[]={720,405,270},steps[]={28,20,12},strides[]={4,4,6};
 for(int k=0;k<3;k++){double times[20];for(int i=-3;i<20;i++){double start=ms();draw(p[0],widths[k],heights[k],steps[k],strides[k]);if(k<2)draw(p[1],k?720:960,k?405:540,20,4);glFinish();if(i>=0)times[i]=ms()-start;}qsort(times,20,sizeof(double),cmp);printf("%s{\"name\":\"%s\",\"p50Ms\":%.3f,\"p95Ms\":%.3f}",k?",":"",names[k],(times[9]+times[10])*.5,times[18]);}
 printf("]}\n");int error=glGetError();eglTerminate(d);return error?4:0;}
