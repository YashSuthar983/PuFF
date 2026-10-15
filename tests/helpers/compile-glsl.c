/* Compile the real shader pairs in an ES3 context. No browser or UI automation. */
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES3/gl3.h>
#include <stdio.h>
#include <stdlib.h>
static GLuint compile(GLenum type,const char*path){
 FILE*f=fopen(path,"rb");if(!f){perror(path);exit(2);}fseek(f,0,SEEK_END);long size=ftell(f);rewind(f);char*source=calloc(size+1,1);fread(source,1,size,f);fclose(f);
 GLuint shader=glCreateShader(type);glShaderSource(shader,1,(const char**)&source,NULL);glCompileShader(shader);free(source);GLint ok;glGetShaderiv(shader,GL_COMPILE_STATUS,&ok);
 if(!ok){char log[8192];glGetShaderInfoLog(shader,sizeof(log),NULL,log);fprintf(stderr,"%s:\n%s\n",path,log);exit(3);}return shader;
}
int main(int argc,char**argv){
 if(argc<3||(argc-1)%2)return 2;
 EGLDisplay display=eglGetPlatformDisplay(EGL_PLATFORM_SURFACELESS_MESA,EGL_DEFAULT_DISPLAY,NULL);
 if(!eglInitialize(display,NULL,NULL))return 77;
 eglBindAPI(EGL_OPENGL_ES_API);
 EGLint attrs[]={EGL_SURFACE_TYPE,EGL_PBUFFER_BIT,EGL_RENDERABLE_TYPE,EGL_OPENGL_ES3_BIT,EGL_NONE};EGLConfig config;EGLint count;
 if(!eglChooseConfig(display,attrs,&config,1,&count)||!count)return 77;
 EGLint surfaceAttrs[]={EGL_WIDTH,1,EGL_HEIGHT,1,EGL_NONE},contextAttrs[]={EGL_CONTEXT_CLIENT_VERSION,3,EGL_NONE};
 EGLSurface surface=eglCreatePbufferSurface(display,config,surfaceAttrs);EGLContext context=eglCreateContext(display,config,EGL_NO_CONTEXT,contextAttrs);
 if(!eglMakeCurrent(display,surface,surface,context))return 77;
 for(int i=1;i<argc;i+=2){GLuint v=compile(GL_VERTEX_SHADER,argv[i]),f=compile(GL_FRAGMENT_SHADER,argv[i+1]),p=glCreateProgram();glAttachShader(p,v);glAttachShader(p,f);glLinkProgram(p);GLint ok;glGetProgramiv(p,GL_LINK_STATUS,&ok);if(!ok){char log[8192];glGetProgramInfoLog(p,sizeof(log),NULL,log);fprintf(stderr,"%s + %s:\n%s\n",argv[i],argv[i+1],log);return 4;}glDeleteProgram(p);glDeleteShader(v);glDeleteShader(f);}
 eglMakeCurrent(display,EGL_NO_SURFACE,EGL_NO_SURFACE,EGL_NO_CONTEXT);eglDestroyContext(display,context);eglDestroySurface(display,surface);eglTerminate(display);return 0;
}
