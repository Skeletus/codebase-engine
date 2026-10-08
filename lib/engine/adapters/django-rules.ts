// Pinned trusted-framework metadata from controlled FS-06 oracles, never customer runtime introspection.
export const djangoRules: Readonly<Record<string, readonly {names: readonly string[]; mro: readonly string[]; methods: readonly string[]}[]>> = {
  "django52": [
    {
      "names": [
        "django.views.generic.base.View",
        "django.views.generic.View",
        "django.views.View"
      ],
      "mro": [
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.base.TemplateView",
        "django.views.generic.TemplateView"
      ],
      "mro": [
        "django.views.generic.base.TemplateView",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.list.ListView",
        "django.views.generic.ListView"
      ],
      "mro": [
        "django.views.generic.list.ListView",
        "django.views.generic.list.MultipleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.list.BaseListView",
        "django.views.generic.list.MultipleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.detail.DetailView",
        "django.views.generic.DetailView"
      ],
      "mro": [
        "django.views.generic.detail.DetailView",
        "django.views.generic.detail.SingleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.detail.BaseDetailView",
        "django.views.generic.detail.SingleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.edit.CreateView",
        "django.views.generic.CreateView"
      ],
      "mro": [
        "django.views.generic.edit.CreateView",
        "django.views.generic.detail.SingleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.edit.BaseCreateView",
        "django.views.generic.edit.ModelFormMixin",
        "django.views.generic.edit.FormMixin",
        "django.views.generic.detail.SingleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.edit.ProcessFormView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "POST",
        "PUT",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.edit.UpdateView",
        "django.views.generic.UpdateView"
      ],
      "mro": [
        "django.views.generic.edit.UpdateView",
        "django.views.generic.detail.SingleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.edit.BaseUpdateView",
        "django.views.generic.edit.ModelFormMixin",
        "django.views.generic.edit.FormMixin",
        "django.views.generic.detail.SingleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.edit.ProcessFormView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "POST",
        "PUT",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.edit.DeleteView",
        "django.views.generic.DeleteView"
      ],
      "mro": [
        "django.views.generic.edit.DeleteView",
        "django.views.generic.detail.SingleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.edit.BaseDeleteView",
        "django.views.generic.edit.DeletionMixin",
        "django.views.generic.edit.FormMixin",
        "django.views.generic.detail.BaseDetailView",
        "django.views.generic.detail.SingleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "POST",
        "DELETE",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.views.APIView"
      ],
      "mro": [
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.ListAPIView"
      ],
      "mro": [
        "rest_framework.generics.ListAPIView",
        "rest_framework.mixins.ListModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.RetrieveAPIView"
      ],
      "mro": [
        "rest_framework.generics.RetrieveAPIView",
        "rest_framework.mixins.RetrieveModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.CreateAPIView"
      ],
      "mro": [
        "rest_framework.generics.CreateAPIView",
        "rest_framework.mixins.CreateModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "POST",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.UpdateAPIView"
      ],
      "mro": [
        "rest_framework.generics.UpdateAPIView",
        "rest_framework.mixins.UpdateModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "PUT",
        "PATCH",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.DestroyAPIView"
      ],
      "mro": [
        "rest_framework.generics.DestroyAPIView",
        "rest_framework.mixins.DestroyModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "DELETE",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.ListCreateAPIView"
      ],
      "mro": [
        "rest_framework.generics.ListCreateAPIView",
        "rest_framework.mixins.ListModelMixin",
        "rest_framework.mixins.CreateModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "POST",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.RetrieveUpdateDestroyAPIView"
      ],
      "mro": [
        "rest_framework.generics.RetrieveUpdateDestroyAPIView",
        "rest_framework.mixins.RetrieveModelMixin",
        "rest_framework.mixins.UpdateModelMixin",
        "rest_framework.mixins.DestroyModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.viewsets.ViewSet"
      ],
      "mro": [
        "rest_framework.viewsets.ViewSet",
        "rest_framework.viewsets.ViewSetMixin",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.viewsets.GenericViewSet"
      ],
      "mro": [
        "rest_framework.viewsets.GenericViewSet",
        "rest_framework.viewsets.ViewSetMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.viewsets.ModelViewSet"
      ],
      "mro": [
        "rest_framework.viewsets.ModelViewSet",
        "rest_framework.mixins.CreateModelMixin",
        "rest_framework.mixins.RetrieveModelMixin",
        "rest_framework.mixins.UpdateModelMixin",
        "rest_framework.mixins.DestroyModelMixin",
        "rest_framework.mixins.ListModelMixin",
        "rest_framework.viewsets.GenericViewSet",
        "rest_framework.viewsets.ViewSetMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.viewsets.ReadOnlyModelViewSet"
      ],
      "mro": [
        "rest_framework.viewsets.ReadOnlyModelViewSet",
        "rest_framework.mixins.RetrieveModelMixin",
        "rest_framework.mixins.ListModelMixin",
        "rest_framework.viewsets.GenericViewSet",
        "rest_framework.viewsets.ViewSetMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    }
  ],
  "django60": [
    {
      "names": [
        "django.views.generic.base.View",
        "django.views.generic.View",
        "django.views.View"
      ],
      "mro": [
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.base.TemplateView",
        "django.views.generic.TemplateView"
      ],
      "mro": [
        "django.views.generic.base.TemplateView",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.list.ListView",
        "django.views.generic.ListView"
      ],
      "mro": [
        "django.views.generic.list.ListView",
        "django.views.generic.list.MultipleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.list.BaseListView",
        "django.views.generic.list.MultipleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.detail.DetailView",
        "django.views.generic.DetailView"
      ],
      "mro": [
        "django.views.generic.detail.DetailView",
        "django.views.generic.detail.SingleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.detail.BaseDetailView",
        "django.views.generic.detail.SingleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.edit.CreateView",
        "django.views.generic.CreateView"
      ],
      "mro": [
        "django.views.generic.edit.CreateView",
        "django.views.generic.detail.SingleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.edit.BaseCreateView",
        "django.views.generic.edit.ModelFormMixin",
        "django.views.generic.edit.FormMixin",
        "django.views.generic.detail.SingleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.edit.ProcessFormView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "POST",
        "PUT",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.edit.UpdateView",
        "django.views.generic.UpdateView"
      ],
      "mro": [
        "django.views.generic.edit.UpdateView",
        "django.views.generic.detail.SingleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.edit.BaseUpdateView",
        "django.views.generic.edit.ModelFormMixin",
        "django.views.generic.edit.FormMixin",
        "django.views.generic.detail.SingleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.edit.ProcessFormView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "POST",
        "PUT",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "django.views.generic.edit.DeleteView",
        "django.views.generic.DeleteView"
      ],
      "mro": [
        "django.views.generic.edit.DeleteView",
        "django.views.generic.detail.SingleObjectTemplateResponseMixin",
        "django.views.generic.base.TemplateResponseMixin",
        "django.views.generic.edit.BaseDeleteView",
        "django.views.generic.edit.DeletionMixin",
        "django.views.generic.edit.FormMixin",
        "django.views.generic.detail.BaseDetailView",
        "django.views.generic.detail.SingleObjectMixin",
        "django.views.generic.base.ContextMixin",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "POST",
        "DELETE",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.views.APIView"
      ],
      "mro": [
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.ListAPIView"
      ],
      "mro": [
        "rest_framework.generics.ListAPIView",
        "rest_framework.mixins.ListModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.RetrieveAPIView"
      ],
      "mro": [
        "rest_framework.generics.RetrieveAPIView",
        "rest_framework.mixins.RetrieveModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.CreateAPIView"
      ],
      "mro": [
        "rest_framework.generics.CreateAPIView",
        "rest_framework.mixins.CreateModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "POST",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.UpdateAPIView"
      ],
      "mro": [
        "rest_framework.generics.UpdateAPIView",
        "rest_framework.mixins.UpdateModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "PUT",
        "PATCH",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.DestroyAPIView"
      ],
      "mro": [
        "rest_framework.generics.DestroyAPIView",
        "rest_framework.mixins.DestroyModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "DELETE",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.ListCreateAPIView"
      ],
      "mro": [
        "rest_framework.generics.ListCreateAPIView",
        "rest_framework.mixins.ListModelMixin",
        "rest_framework.mixins.CreateModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "POST",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.generics.RetrieveUpdateDestroyAPIView"
      ],
      "mro": [
        "rest_framework.generics.RetrieveUpdateDestroyAPIView",
        "rest_framework.mixins.RetrieveModelMixin",
        "rest_framework.mixins.UpdateModelMixin",
        "rest_framework.mixins.DestroyModelMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "GET",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.viewsets.ViewSet"
      ],
      "mro": [
        "rest_framework.viewsets.ViewSet",
        "rest_framework.viewsets.ViewSetMixin",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.viewsets.GenericViewSet"
      ],
      "mro": [
        "rest_framework.viewsets.GenericViewSet",
        "rest_framework.viewsets.ViewSetMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.viewsets.ModelViewSet"
      ],
      "mro": [
        "rest_framework.viewsets.ModelViewSet",
        "rest_framework.mixins.CreateModelMixin",
        "rest_framework.mixins.RetrieveModelMixin",
        "rest_framework.mixins.UpdateModelMixin",
        "rest_framework.mixins.DestroyModelMixin",
        "rest_framework.mixins.ListModelMixin",
        "rest_framework.viewsets.GenericViewSet",
        "rest_framework.viewsets.ViewSetMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    },
    {
      "names": [
        "rest_framework.viewsets.ReadOnlyModelViewSet"
      ],
      "mro": [
        "rest_framework.viewsets.ReadOnlyModelViewSet",
        "rest_framework.mixins.RetrieveModelMixin",
        "rest_framework.mixins.ListModelMixin",
        "rest_framework.viewsets.GenericViewSet",
        "rest_framework.viewsets.ViewSetMixin",
        "rest_framework.generics.GenericAPIView",
        "rest_framework.views.APIView",
        "django.views.generic.base.View",
        "builtins.object"
      ],
      "methods": [
        "OPTIONS"
      ]
    }
  ]
};
