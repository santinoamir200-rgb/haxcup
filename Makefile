# HaxCup para PS3 (QuickJS + SDL2 sobre PSL1GHT)
#
# Usa las reglas estandar de PSL1GHT (ppu_rules / base_rules), que ya saben
# generar .self, .pkg y el .gnpdrm.pkg finalizado. Reemplaza al viejo
# ps3pkg.py, que no venia en el zip.
#
#   make        -> compila el .self
#   make pkg    -> arma el .pkg (assets/ va a USRDIR dentro del paquete)
#   make clean

ifeq ($(strip $(PS3DEV)),)
$(error Defini PS3DEV en tu entorno)
endif
ifeq ($(strip $(PSL1GHT)),)
$(error Defini PSL1GHT en tu entorno)
endif

# Estas variables se definen ANTES de ppu_rules, que solo usa "?=" con ellas.
TARGET    := subasta-cuartos-v5
TITLE     := HaxCup
APPID     := SUBA00001
CONTENTID := UP0001-$(APPID)_00-0000000000000000
ICON0     := $(CURDIR)/ICON0.PNG
BUILDDIR  := $(CURDIR)/build
PKGFILES  := $(BUILDDIR)/pkgfiles

include $(PSL1GHT)/ppu_rules

# base_rules solo pone LD con "?=" y make ya trae LD=ld por defecto: hay que forzarlo
# para linkear con ppu-gcc y no con el ld del sistema.
LD := $(PREFIX)gcc

SRCDIR := source
OBJDIR := $(BUILDDIR)/obj

CFLAGS   := -O2 -Wall -mcpu=cell $(MACHDEP) -DAPPID=\"$(APPID)\" \
            -I$(PSL1GHT)/ppu/include -I$(PORTLIBS)/include \
            -I$(PORTLIBS)/include/SDL2 -I$(PORTLIBS)/include/quickjs
LDFLAGS  := $(MACHDEP) -Wl,--gc-sections
LIBPATHS := -L$(PSL1GHT)/ppu/lib -L$(PORTLIBS)/lib
LIBS     := -lquickjs -lSDL2_image -lSDL2 -lpng -ljpeg -lz \
            -lrsx -lgcm_sys -lio -laudio -lsysutil -lsysmodule -lrt -llv2 -lm
# Libs extra que declare el propio SDL2 (si instalo sdl2-config); se agregan al final.
LIBS     += $(shell $(PORTLIBS)/bin/sdl2-config --static-libs 2>/dev/null)

OFILES := $(OBJDIR)/main.o

.PHONY: all pkg stage clean

all: $(TARGET).self

$(OBJDIR)/%.o: $(SRCDIR)/%.c | $(OBJDIR)
	$(VERB) echo $(notdir $<)
	$(VERB) $(CC) $(CFLAGS) -c $< -o $@

$(OBJDIR):
	$(VERB) mkdir -p $@

# La receta de .elf / .self / .pkg viene de base_rules y ppu_rules.
$(TARGET).elf: $(OFILES)

# Copia assets/ a <pkg>/USRDIR/ (ahi los lee main.c: /dev_hdd0/game/APPID/USRDIR/)
stage:
	$(VERB) rm -rf $(PKGFILES)
	$(VERB) mkdir -p $(PKGFILES)/USRDIR
	$(VERB) cp assets/* $(PKGFILES)/USRDIR/

pkg: stage
	$(VERB) rm -f $(TARGET).pkg $(TARGET).gnpdrm.pkg
	$(VERB) $(MAKE) --no-print-directory $(TARGET).pkg

clean:
	rm -rf $(BUILDDIR) $(TARGET).elf $(TARGET).self $(TARGET).fake.self \
	       $(TARGET).pkg $(TARGET).gnpdrm.pkg
